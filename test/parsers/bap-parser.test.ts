import type { Element } from 'domhandler';

import axios from 'axios';
import { expect } from 'chai';
import * as cheerio from 'cheerio';
import fs from 'node:fs';
import path from 'node:path';

import { HttpStatusError, fetchJson } from '../../src/http/fetch.js';
import { BAPParser, BapCompetitionNotFoundError, BapHtmlStructureError } from '../../src/parsers/bap-parser.js';
import { brewerOrClubExpectation, cell, expectOnlyClubRows, rowsOf } from './filter-helpers.js';

const readFixture = (name: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), 'test/resources/api', name), 'utf8'));

function fixtureFetcher(requested: string[]): typeof fetchJson {
  return (async (u: string) => {
    requested.push(u);
    return u.includes('loadCompetitionInfo') ? readFixture('bap_competition_info.json') : readFixture('bap_results.json');
  }) as typeof fetchJson;
}

const NO_FILTERS = { brewers: undefined, club: undefined };

const readResource = (...segments: string[]): string => fs.readFileSync(path.join(process.cwd(), 'test/resources', ...segments), 'utf8');

type ClassVariant = 'misleading' | 'original' | 'scrambled' | 'stripped' | 'titles-only';

const VARIANTS: ClassVariant[] = ['original', 'stripped', 'scrambled', 'misleading', 'titles-only'];

/**
 * Rewrites the class attributes (or all attributes but title) of a saved page.
 *
 * @param html the saved page
 * @param variant how to rewrite it
 * @returns the rewritten page
 */
function withClasses(html: string, variant: ClassVariant): string {
  if (variant === 'original') return html;

  const $ = cheerio.load(html);
  $('*').each((index, node) => {
    const element = node as Element;
    switch (variant) {
    case 'titles-only': {
      const { title } = element.attribs;
      element.attribs = title === undefined ? {} : { title };
    break;
    }

    case 'stripped': {
      delete element.attribs.class;
    break;
    }

    case 'scrambled': {
      element.attribs.class = `zz${(index * 7919) % 1009} qq${index}`;
    break;
    }

    default: {
      element.attribs.class = 'jss95 jss99 jss96 MuiCard-root MuiCardHeader-title';
    }
    }
  });
  return $.html();
}

function removeParagraphs($: cheerio.CheerioAPI, prefix: string): void {
  for (const element of $('p').toArray().filter(item => $(item).text().startsWith(prefix))) $(element).remove();
}

// The API keeps double spaces in some category names; a rendered page collapses them.
const normalize = (rows: string[]): string[] => rows.map(row => row.replaceAll(/\s+/g, ' ')).sort();


/**
 * Parses the BAP API fixture for a competition through the real API code path.
 *
 * @param url the competition results URL
 * @param resultsFixture file name under test/resources/api
 * @param filters row filters
 * @returns the parsed result
 */
async function parseViaApi(url: string, resultsFixture: string, filters = NO_FILTERS) {
  const original = axios.defaults.adapter;
  // The API path leaves "N Entries" in the category name, so rewrite it to "(N)" to compare the other columns.
  const results = JSON.parse(readResource('api', resultsFixture).replaceAll(/ (\d+) Entries"/g, ' ($1)"'));
  axios.defaults.adapter = async config => ({
    config,
    data: String(config.url).includes('loadCompetitionInfo') ? { competition: { competitionId: 'fixture-id' } } : results,
    headers: {},
    status: 200,
    statusText: 'OK',
  });

  try {
    return await new BAPParser().parseResults('', filters, url);
  } finally {
    axios.defaults.adapter = original;
  }
}

/**
 * Runs something while collecting what it writes to stderr.
 *
 * @param action the work to run
 * @returns what it returned and the console.error messages
 */
async function captureStderr<T>(action: () => Promise<T>): Promise<{ messages: string[]; value: T }> {
  const messages: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { messages.push(args.join(' ')); };
  try {
    return { messages, value: await action() };
  } finally {
    console.error = original;
  }
}

/**
 * Defers a call, so a test can hand it to captureStderr without a nested callback.
 *
 * @param fn the function
 * @param args its arguments
 * @returns a function that makes the call
 */
const later = <A extends unknown[], R>(fn: (...args: A) => R, ...args: A) => () => fn(...args);

const skipNotices = (messages: string[]): string[] => messages.filter(message => message.startsWith('Skipping BAP custom award'));

const parse = async (html: string): Promise<string[]> => rowsOf(await new BAPParser().parseResults(html, NO_FILTERS));

/**
 * Awaits something expected to reject.
 *
 * @param promise the pending call
 * @returns the error it rejected with
 */
async function rejection(promise: Promise<unknown>): Promise<Error> {
  let outcome: { error: Error } | { value: unknown };
  try {
    outcome = { value: await promise };
  } catch (error) {
    outcome = { error: error as Error };
  }

  if (!('error' in outcome)) expect.fail('expected a rejection');
  return outcome.error;
}

const RENDERED_PAGES = [
  {
    api: 'bap_trimmed_results_2026_ash_copper_state_cup.json',
    html: 'bap_rendered_2026_ash_copper_state_cup.html',
    rows: 18,
    url: 'https://beerawardsplatform.com/2026-ash-copper-state-cup/results',
  },
  {
    api: 'bap_trimmed_results_2026_boneyard_brew_off.json',
    html: 'bap_rendered_2026_boneyard_brew_off.html',
    rows: 12,
    url: 'https://beerawardsplatform.com/the-2026-boneyard-brew-off/results',
  },
];

const COPPER_BOS_ROWS = [
  'Best of Show|1st||Bamberg|Rauchbier|Stephen Schmitt|The Brü Club',
  'Best of Show|2nd||Tripel|Belgian Tripel|Stephen Schmitt|The Brü Club',
  'Best of Show|3rd||CDL|Czech Dark Lager|Ross Stuart|Arizona Society of Homebrewers',
  'Best of Show|HM||Bob\'s Your Scottish Uncle Ale|Scottish Export|Wayne Feller|Arizona Society of Homebrewers',
];
const OLD_WORDING = 'Dan Acheson / Club: Urban Knaves of Grain - ZE FRAHNCH (C1D – French Cider)';
const COPPER_CUSTOM_ROW = 'Best of Show - Mead & Cider|1st||ONE BAAAAD APPLE....|Cyser|Scott Estlund|The Brü Club';
const BONEYARD_BOS_ROWS = [
  'Best of Show|1st||One Bad Apple...|Cyser|Scott Estlund|The Brü Club',
  'Best of Show|2nd||Smoke Wagon|Rauchbier|Taylor Shastid|Diablo Order of Zymiracle Enthusiasts (DOZE)',
  'Best of Show|3rd||Bigwig IPA|Specialty IPA|Danny Sack|Evanston Homebrew Club',
];

function describeAshPage(variant: ClassVariant): void {
  describe(`ASH 2026 page (${variant} classes)`, () => {
    let rows: string[];

    before(async () => {
      const html = withClasses(readResource('results', 'bap_rendered_2026_ash_copper_state_cup.html'), variant);
      rows = rowsOf(await new BAPParser().parseResults(html, NO_FILTERS));
    });

    it('maps #1-#4 to 1st, 2nd, 3rd and HM', () => {
      expect(rows).to.include('American Ales|1st|12|Crimson Rye|Alternative Grain Beer|Josh Reid|Missouri Mashers');
      expect(rows).to.include('American Ales|HM|12|APA|American Pale Ale|Ross Stuart|Arizona Society of Homebrewers');
      expect(rows.filter(row => row.startsWith('American Ales|'))).to.have.length(4);
    });

    it('reads Best of Show and its custom award, and skips positions with no award', () => {
      expect(rows.filter(row => row.startsWith('Best of Show|'))).to.deep.equal(COPPER_BOS_ROWS);
      expect(rows).to.include(COPPER_CUSTOM_ROW);
      expect(rows.filter(row => row.startsWith('Amber and Dark European Lager|'))).to.have.length(3);
    });

    it('reads the brewer ahead of a collaboration line and the club after it', () => {
      expect(rows).to.include('Sour Wild Experimental and Wood-Aged Beers|1st|11|CZAR|Specialty Wood-Aged Beer|Gary Lynn|Arizona Society of Homebrewers');
    });

    it('filters by club', async () => {
      const html = withClasses(readResource('results', 'bap_rendered_2026_ash_copper_state_cup.html'), variant);
      const result = await new BAPParser().parseResults(html, { brewers: undefined, club: 'The Brü Club' });

      expect(normalize(rowsOf(result))).to.deep.equal(normalize([
        ...COPPER_BOS_ROWS.filter(row => row.endsWith('|The Brü Club')),
        COPPER_CUSTOM_ROW,
        'Mead and Cider|1st|14|One Baaaad Apple....|Cyser|Scott Estlund|The Brü Club',
      ]));
    });

    it('drops Best of Show rows that the club filter excludes', async () => {
      const html = withClasses(readResource('results', 'bap_rendered_2026_ash_copper_state_cup.html'), variant);
      const result = await new BAPParser().parseResults(html, { brewers: undefined, club: 'Arizona Society of Homebrewers' });
      const bos = rowsOf(result).filter(row => row.startsWith('Best of Show'));

      expect(bos).to.deep.equal(COPPER_BOS_ROWS.filter(row => row.endsWith('|Arizona Society of Homebrewers')));
      expect(bos).to.have.length(2);
    });
  });
}

function describeBoneyardPage(variant: ClassVariant): void {
  describe(`Boneyard 2026 page (${variant} classes)`, () => {
    it('reads "N Entries" headings as the entry count', async () => {
      const html = withClasses(readResource('results', 'bap_rendered_2026_boneyard_brew_off.html'), variant);
      const rows = rowsOf(await new BAPParser().parseResults(html, NO_FILTERS));

      expect(rows).to.include('Amber Lager|1st|17|Smoke Wagon|Rauchbier|Taylor Shastid|Diablo Order of Zymiracle Enthusiasts (DOZE)');
      expect(rows).to.include('Spiced and Specialty Mead|3rd|9|The Morrígan|Experimental Mead|Austin Brown|Brewers Anonymous');
    });

    it('reads the Best of Show card with a blank entry count', async () => {
      const html = withClasses(readResource('results', 'bap_rendered_2026_boneyard_brew_off.html'), variant);
      const rows = rowsOf(await new BAPParser().parseResults(html, NO_FILTERS));

      expect(rows.filter(row => row.startsWith('Best of Show|'))).to.deep.equal(BONEYARD_BOS_ROWS);
    });
  });
}

const split = (name: string) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (new BAPParser() as any).extractCategoryAndEntryCount(name) as { categoryName: string; entryCount: string };

const entry = (name: string, brewer: string, club: string) => ({
  name,
  participant: { club, name: brewer },
  styleSubcategory: 'Some Style',
});

describe('BAP Parser', () => {
  let parser: BAPParser;
  let html: string;

  before(() => {
    parser = new BAPParser();
    const htmlPath = path.join(process.cwd(), 'test/resources/results/bap_results.html');
    html = fs.readFileSync(htmlPath, 'utf8');
  });

  describe('HTML Parsing (saved page)', () => {
    it('should parse results from BAP HTML', async () => {
      const result = await parser.parseResults(html, { brewers: undefined, club: undefined });
      
      expect(result).to.not.be.undefined;
      expect(result?.header).to.include('Brewer');
      expect(result?.header).to.include('Entry Name');
      expect(result?.header).to.include('Style');
      expect(result?.data).to.include('Christian Chandler');
      expect(result?.data).to.include('Arizona Society of Homebrewers');
    });

    it('should filter by brewer name', async () => {
      const result = await parser.parseResults(html, { brewers: 'Christian Chandler', club: undefined });
      
      expect(result).to.not.be.undefined;
      expect(result?.data).to.include('Christian Chandler');
    });

    it('should filter by club', async () => {
      const result = await parser.parseResults(html, { brewers: undefined, club: 'Arizona Society of Homebrewers' });
      
      expect(result).to.not.be.undefined;
      expect(result?.data).to.include('Arizona Society of Homebrewers');
    });
  });

  describe('API Parsing (live page)', () => {
    it('should extract competition key from URL', () => {
      const url = 'https://beerawardsplatform.com/2025-ash-copper-state-cup/results';
      // Access private method for testing
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const key = (parser as any).extractCompetitionKey(url);
      expect(key).to.equal('2025-ash-copper-state-cup');
    });

    describe('competition key extraction', () => {
      const key = 'the-2026-boneyard-brew-off';
      const base = `https://beerawardsplatform.com/${key}`;
      const forms: [string, string][] = [
        ['bare URL', base],
        ['trailing slash', `${base}/`],
        ['/results', `${base}/results`],
        ['/results with trailing slash', `${base}/results/`],
        ['query string', `${base}?tab=results`],
        ['trailing slash and query string', `${base}/?tab=results`],
        ['fragment', `${base}#results`],
        ['/results with query and fragment', `${base}/results?a=1#top`],
        ['www subdomain', `https://www.beerawardsplatform.com/${key}`],
        ['uppercase host', `https://BeerAwardsPlatform.com/${key}`],
        ['explicit non-default port', `https://beerawardsplatform.com:8443/${key}`],
        ['leading double slash', `https://beerawardsplatform.com//${key}`],
      ];

      for (const [name, url] of forms) {
        it(`should extract the key from a ${name}`, () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          expect((parser as any).extractCompetitionKey(url)).to.equal(key);
        });
      }

      const unparseable: [string, string][] = [
        ['no path', 'https://beerawardsplatform.com'],
        ['root path', 'https://beerawardsplatform.com/'],
        ['query only', 'https://beerawardsplatform.com/?x=1'],
        ['not a URL', 'not a url'],
        ['scheme-less', 'beerawardsplatform.com/some-comp'],
        ['other host', 'https://example.com/some-comp/results'],
        ['lookalike host', 'https://notbeerawardsplatform.com/some-comp'],
        ['BAP in path of other host', 'https://example.com/beerawardsplatform.com/some-comp/'],
      ];

      for (const [name, url] of unparseable) {
        it(`should return null for ${name}`, () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          expect((parser as any).extractCompetitionKey(url)).to.equal(null);
        });
      }

      it('should decode a percent-encoded key', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((parser as any).extractCompetitionKey('https://beerawardsplatform.com/foo%26x%20y/results')).to.equal('foo&x y');
      });

      it('should fall back to the raw segment when the percent-encoding is malformed', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((parser as any).extractCompetitionKey('https://beerawardsplatform.com/50%/results')).to.equal('50%');
      });

      it('should query the API with the key from a bare URL', async () => {
        const local = new BAPParser();
        const seen: string[] = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (local as any).parseApiData = async (competitionKey: string) => {
          seen.push(competitionKey);
          return { items: [{ award: false, row: ['Cat', '1st', '9', 'Beer', 'Style', 'Brewer', 'Club'] }], skipped: [] };
        };

        const result = await local.parseResults('<html></html>', { brewers: undefined, club: undefined }, base);
        expect(seen).to.deep.equal([key]);
        expect(result?.data).to.include('Brewer');
      });

      it('should throw a clear error rather than return empty for an unparseable URL', async () => {
        let thrown: unknown;
        try {
          await parser.parseResults(html, { brewers: undefined, club: undefined }, 'https://beerawardsplatform.com/');
        } catch (error) {
          thrown = error;
        }

        expect(thrown, 'expected parseResults to throw').to.be.instanceOf(Error);
        expect((thrown as Error).message).to.contain('Could not extract a BAP competition key');
        expect((thrown as Error).message).to.contain('https://beerawardsplatform.com/');
      });
    });

    it('should parse API data structure', async () => {
      // Load the API response fixtures
      const competitionInfoPath = path.join(process.cwd(), 'test/resources/api/bap_competition_info.json');
      const resultsPath = path.join(process.cwd(), 'test/resources/api/bap_results.json');
      
      const competitionInfo = JSON.parse(fs.readFileSync(competitionInfoPath, 'utf8'));
      const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
      
      // Verify the structure we expect
      expect(competitionInfo.competition).to.not.be.undefined;
      expect(competitionInfo.competition.competitionId).to.equal('Po3yXa0IULLxtPjWBlvm');
      expect(results.results).to.not.be.undefined;
      expect(results.results.miniBos).to.not.be.undefined;
    });

    it('should parse results from API data', async () => {
      // This test verifies the API data contains expected brewers
      const resultsPath = path.join(process.cwd(), 'test/resources/api/bap_results.json');
      const apiData = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
      
      const { miniBos } = apiData.results;
      const brewers = new Set<string>();
      
      // Extract all brewer names from the API data
      for (const categoryId in miniBos) {
        if (!Object.hasOwn(miniBos, categoryId)) continue;

        const category = miniBos[categoryId];
        const positions = category.positions || {};
        
        for (const position in positions) {
          if (!Object.hasOwn(positions, position)) continue;

          const entries = positions[position];
          if (!Array.isArray(entries)) continue;

          for (const entry of entries) {
            const brewer = entry.participant?.name || entry.participant?.displayName || '';
            if (brewer) brewers.add(brewer);
          }
        }
      }
      
      expect(brewers.has('Cheyne Harvey')).to.be.true;
      expect(brewers.has('Christian Chandler')).to.be.true;
    });
  });
  describe('API path (stubbed fetcher)', () => {
    const noFilters = { brewers: undefined, club: undefined };
    const url = 'https://beerawardsplatform.com/the-2026-boneyard-brew-off';

    it('should fetch info then results for a bare URL and return rows', async () => {
      const requested: string[] = [];
      const result = await new BAPParser(fixtureFetcher(requested)).parseResults('', noFilters, url);

      expect(requested).to.have.length(2);
      expect(requested[0]).to.equal('https://beerawardsplatform.com/api/loadCompetitionInfo?competitionKey=the-2026-boneyard-brew-off&includeEntryCount');
      expect(requested[1]).to.equal('https://beerawardsplatform.com/api/getResults?competitionId=Po3yXa0IULLxtPjWBlvm');
      expect(result?.data).to.include('Christian Chandler');
    });

    it('should apply the club filter to API rows', async () => {
      const result = await new BAPParser(fixtureFetcher([])).parseResults('', { brewers: undefined, club: 'Arizona Society of Homebrewers' }, url);
      expect(result?.data.split('\n').every(row => row.endsWith('|Arizona Society of Homebrewers'))).to.equal(true);
    });

    it('should percent-encode the key in the API URL', async () => {
      const requested: string[] = [];
      await new BAPParser(fixtureFetcher(requested)).parseResults('', noFilters, 'https://beerawardsplatform.com/foo%26x%3Dy/results');
      expect(requested[0]).to.contain('competitionKey=foo%26x%3Dy&');
    });

    it('should percent-encode the competition id in the results URL', async () => {
      const requested: string[] = [];
      const fetcher = (async (u: string) => {
        requested.push(u);
        return u.includes('loadCompetitionInfo') ? { competition: { competitionId: 'a/b&c' } } : readFixture('bap_results.json');
      }) as typeof fetchJson;
      await new BAPParser(fetcher).parseResults('', noFilters, url);
      expect(requested[1]).to.equal('https://beerawardsplatform.com/api/getResults?competitionId=a%2Fb%26c');
    });

    it('should raise a not-found error when the API answers 404 for the key', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fetcher = (async (u: string) => { throw new HttpStatusError(u, 404); }) as any;
      let thrown: unknown;
      try {
        await new BAPParser(fetcher).parseResults('', noFilters, 'https://beerawardsplatform.com/competitions');
      } catch (error) {
        thrown = error;
      }

      expect(thrown, 'expected a rejection').to.be.instanceOf(BapCompetitionNotFoundError);
      expect((thrown as Error).name).to.equal('BapCompetitionNotFoundError');
      expect((thrown as Error).message).to.match(/^No BAP competition found for key "competitions"/);
    });

    it('should raise a not-found error when the API returns no competitionId', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fetcher = (async () => ({})) as any;
      let thrown: unknown;
      try {
        await new BAPParser(fetcher).parseResults('', noFilters, url);
      } catch (error) {
        thrown = error;
      }

      expect(thrown, 'expected a rejection').to.be.instanceOf(BapCompetitionNotFoundError);
      expect((thrown as Error).message).to.match(/^No BAP competition found for key "the-2026-boneyard-brew-off"/);
    });

    it('should rethrow a transient API failure when the HTML fallback finds nothing', async () => {
      const fetcher = (async (u: string) => {
        if (u.includes('loadCompetitionInfo')) return readFixture('bap_competition_info.json');
        throw new HttpStatusError(u, 500);
      }) as typeof fetchJson;
      const parser = new BAPParser(fetcher);
      const { value: thrown } = await captureStderr(later(rejection, parser.parseResults('<html><div id="root"></div></html>', noFilters, url)));

      expect(thrown).to.be.instanceOf(HttpStatusError);
      expect((thrown as HttpStatusError).status).to.equal(500);
    });

    it('should say the filters matched nothing when the competition was read', async () => {
      const { messages, value: result } = await captureStderr(() => new BAPParser(fixtureFetcher([])).parseResults('', { brewers: 'Nobody At All', club: undefined }, url));
      expect(result).to.equal(undefined);

      // The fixture's two custom awards use another wording, which is reported even when the filters drop everything
      expect(messages.filter(message => message.startsWith('Skipping BAP custom award'))).to.have.length(2);
      expect(messages.filter(message => !message.startsWith('Skipping BAP custom award'))).to.deep.equal([
        'Competition read, but no medals matched the given filters (2 custom award lines were skipped for an unrecognized format; see above)',
      ]);
    });

    it('should say the filters matched nothing for a club filter too', async () => {
      const { messages } = await captureStderr(() => new BAPParser(fixtureFetcher([])).parseResults('', { brewers: undefined, club: 'No Such Club' }, url));

      // The fixture's two custom awards use another wording, which is reported even when the filters drop everything
      expect(messages.filter(message => message.startsWith('Skipping BAP custom award'))).to.have.length(2);
      expect(messages.filter(message => !message.startsWith('Skipping BAP custom award'))).to.deep.equal([
        'Competition read, but no medals matched the given filters (2 custom award lines were skipped for an unrecognized format; see above)',
      ]);
    });

    it('should treat a results response with no medal list as published-nothing, not as a failure', async () => {
      const fetcher = (async (u: string) =>
        u.includes('loadCompetitionInfo') ? readFixture('bap_competition_info.json') : { results: {} }) as typeof fetchJson;
      const { messages, value: result } = await captureStderr(() => new BAPParser(fetcher).parseResults('', noFilters, url));
      expect(result).to.equal(undefined);

      expect(messages).to.deep.equal(['Competition read, but it has no published medals']);
    });

    it('should not fall back to saved HTML for a competition the API says is unknown', async () => {
      const fetcher = (async (u: string) => { throw new HttpStatusError(u, 404); }) as typeof fetchJson;
      let thrown: unknown;
      try {
        await new BAPParser(fetcher).parseResults(html, noFilters, url);
      } catch (error) {
        thrown = error;
      }

      expect(thrown, 'expected a rejection').to.be.instanceOf(BapCompetitionNotFoundError);
    });

    it('should say there are no published medals when the competition was read and nothing was asked for', async () => {
      const fetcher = (async (u: string) =>
        u.includes('loadCompetitionInfo') ? readFixture('bap_competition_info.json') : { results: { miniBos: {} } }) as typeof fetchJson;
      const { messages, value: result } = await captureStderr(() => new BAPParser(fetcher).parseResults('', noFilters, url));
      expect(result).to.equal(undefined);

      expect(messages).to.deep.equal(['Competition read, but it has no published medals']);
    });

    it('should fail loudly when a saved page with no URL is unrecognizable', async () => {
      let thrown: unknown;
      try {
        await new BAPParser().parseResults('<html></html>', noFilters);
      } catch (error) {
        thrown = error;
      }

      expect(thrown, 'expected a rejection').to.be.instanceOf(BapHtmlStructureError);
    });

    it('should fall back to saved HTML when the API fails transiently', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fetcher = (async (u: string) => { throw new HttpStatusError(u, 500); }) as any;
      const { value: result } = await captureStderr(() => new BAPParser(fetcher).parseResults(html, noFilters, url));
      expect(result?.data).to.include('Christian Chandler');
    });
  });


  describe('Diacritic-insensitive club filter (saved HTML)', () => {
    const none = { brewers: undefined, club: undefined };

    it('matches an accented published club with an unaccented filter', async () => {
      const accented = html.replaceAll('Arizona Society of Homebrewers', 'Arizöna Society of Homebrewers');
      const full = await parser.parseResults(accented, none);
      const result = await parser.parseResults(accented, { brewers: undefined, club: 'Arizona Society of Homebrewers' });

      expectOnlyClubRows(full, result, 'Arizöna Society of Homebrewers');
    });

    it('matches an unaccented published club with an accented filter', async () => {
      const full = await parser.parseResults(html, none);
      const result = await parser.parseResults(html, { brewers: undefined, club: 'Arizöna Society of Homebrewers' });

      expectOnlyClubRows(full, result, 'Arizona Society of Homebrewers');
    });

    it('matches regardless of case and spacing', async () => {
      const full = await parser.parseResults(html, none);
      const result = await parser.parseResults(html, { brewers: undefined, club: '  ARIZONA SOCIETY  OF HOMEBREWERS ' });

      expectOnlyClubRows(full, result, 'Arizona Society of Homebrewers');
    });

    it('returns nothing for a non-matching club', async () => {
      const result = await parser.parseResults(html, { brewers: undefined, club: 'No Such Club' });

      expect(rowsOf(result)).to.be.empty;
    });

    it('does not treat a filter that is a prefix of the club as a match', async () => {
      const result = await parser.parseResults(html, { brewers: undefined, club: 'Arizona Society of' });

      expect(rowsOf(result)).to.be.empty;
    });

    it('does not treat a filter that extends the club name as a match', async () => {
      const result = await parser.parseResults(html, { brewers: undefined, club: 'Arizona Society of Homebrewers Extra' });

      expect(rowsOf(result)).to.be.empty;
    });

    it('does not let a blank club filter match entries', async () => {
      const result = await parser.parseResults(html, { brewers: undefined, club: ' \u0301 ' });

      expect(rowsOf(result)).to.be.empty;
    });
  });

  describe('Diacritic-insensitive filters (API path)', () => {
    const base = 'https://beerawardsplatform.com/2025-ash-copper-state-cup/results';
    const info = fs.readFileSync(path.join(process.cwd(), 'test/resources/api/bap_competition_info.json'), 'utf8');
    const results = fs.readFileSync(path.join(process.cwd(), 'test/resources/api/bap_results.json'), 'utf8');
    const none = { brewers: undefined, club: undefined };
    const originalGet = axios.get;

    // Serves the fixtures in place of the BAP API; resultsBody is the getResults payload.
    function stubApi(resultsBody: string): void {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (axios as any).get = async (url: string) => ({
        data: JSON.parse(url.includes('loadCompetitionInfo') ? info : resultsBody),
        headers: {},
        status: 200,
      });
    }

    afterEach(() => {
      axios.get = originalGet;
    });

    it('serves the API rows, not the saved page', async () => {
      stubApi(results);
      const viaApi = await parser.parseResults('', none, base);

      expect(rowsOf(viaApi)).to.not.be.empty;
    });

    it('matches an unaccented filter against an accented published club', async () => {
      stubApi(results);
      const full = await parser.parseResults('', none, base);
      const result = await parser.parseResults('', { brewers: undefined, club: 'The Bru Club' }, base);

      expectOnlyClubRows(full, result, 'The Brü Club');
    });

    it('matches an accented filter against an unaccented published club', async () => {
      stubApi(results.replaceAll('The Brü Club', 'The Bru Club'));
      const full = await parser.parseResults('', none, base);
      const result = await parser.parseResults('', { brewers: undefined, club: 'The Brü Club' }, base);

      expectOnlyClubRows(full, result, 'The Bru Club');
    });

    it('returns nothing for a non-matching club', async () => {
      stubApi(results);
      const result = await parser.parseResults('', { brewers: undefined, club: 'No Such Club' }, base);

      expect(rowsOf(result)).to.be.empty;
    });

    it('does not treat a prefix of the club as a match', async () => {
      stubApi(results);
      const result = await parser.parseResults('', { brewers: undefined, club: 'The Bru' }, base);

      expect(rowsOf(result)).to.be.empty;
    });

    it('includes entries matching the brewer or the club', async () => {
      stubApi(results);
      const full = await parser.parseResults('', none, base);
      const { brewer, expected } = brewerOrClubExpectation(full, 5, 'The Brü Club');
      const result = await parser.parseResults('', { brewers: brewer, club: 'The Brü Club' }, base);

      expect(rowsOf(result)).to.deep.equal(expected);
    });

    it('matches an accented brewer filter against the published name, and vice versa', async () => {
      stubApi(results);
      const plain = await parser.parseResults('', { brewers: 'Christiån Chandler', club: undefined }, base);
      expect(rowsOf(plain)).to.not.be.empty;
      expect(rowsOf(plain).every(row => row.includes('Christian Chandler'))).to.equal(true);

      stubApi(results.replaceAll('Christian Chandler', 'Christiån Chandler'));
      const accented = await parser.parseResults('', { brewers: 'christian chandler', club: undefined }, base);
      expect(rowsOf(accented)).to.deep.equal(rowsOf(plain).map(row => row.replaceAll('Christian Chandler', 'Christiån Chandler')));
    });
  });

  describe('Brewers filter (saved HTML)', () => {
    const none = { brewers: undefined, club: undefined };
    const club = 'Arizona Society of Homebrewers';

    it('keeps only the named brewer', async () => {
      const result = await parser.parseResults(html, { brewers: 'christian  CHANDLER', club: undefined });

      expect(rowsOf(result)).to.not.be.empty;
      expect(rowsOf(result).every(row => cell(row, 5) === 'Christian Chandler')).to.equal(true);
    });

    it('includes entries matching the brewer or the club', async () => {
      const full = await parser.parseResults(html, none);
      const clubOnly = await parser.parseResults(html, { brewers: undefined, club });
      const result = await parser.parseResults(html, { brewers: 'Jeremy L. Jones', club });
      const expected = rowsOf(full).filter(row => cell(row, 5) === 'Jeremy L. Jones' || row.endsWith(`|${club}`));

      expect(expected.length).to.be.greaterThan(rowsOf(clubOnly).length);
      expect(rowsOf(result)).to.deep.equal(expected);
    });
  });

  describe('HTML fallback without class names', () => {
    for (const page of RENDERED_PAGES) {
      const html = readResource('results', page.html);

      for (const variant of VARIANTS) {
        describe(`${page.html} (${variant} classes)`, () => {
          it('yields the same rows as the API path', async () => {
            const fromHtml = await new BAPParser().parseResults(withClasses(html, variant), NO_FILTERS);
            const fromApi = await parseViaApi(page.url, page.api);

            expect(rowsOf(fromHtml)).to.have.length(page.rows);
            expect(normalize(rowsOf(fromHtml))).to.deep.equal(normalize(rowsOf(fromApi)));
          });
        });
      }
    }

    for (const page of RENDERED_PAGES) {
      it(`${page.html}: yields the same Brü Club rows as the API path, Best of Show included`, async () => {
        const filters = { brewers: undefined, club: 'The Brü Club' };
        const fromHtml = await new BAPParser().parseResults(readResource('results', page.html), filters);
        const fromApi = await parseViaApi(page.url, page.api, filters);

        expect(rowsOf(fromHtml).some(row => row.startsWith('Best of Show'))).to.equal(true);
        expect(normalize(rowsOf(fromHtml))).to.deep.equal(normalize(rowsOf(fromApi)));
      });
    }

    it('gives the Brü Club the Best of Show rows of both real competitions', async () => {
      const copper = await parseViaApi(RENDERED_PAGES[0].url, RENDERED_PAGES[0].api, { brewers: undefined, club: 'The Brü Club' });
      const boneyard = await parseViaApi(RENDERED_PAGES[1].url, RENDERED_PAGES[1].api, { brewers: undefined, club: 'The Brü Club' });

      expect(rowsOf(copper).filter(row => row.startsWith('Best of Show'))).to.deep.equal([
        COPPER_BOS_ROWS[0],
        COPPER_BOS_ROWS[1],
        COPPER_CUSTOM_ROW,
      ]);
      expect(rowsOf(boneyard).filter(row => row.startsWith('Best of Show'))).to.deep.equal([BONEYARD_BOS_ROWS[0]]);
    });

    it('skips the old fixture custom awards (another wording) with a notice on both paths', async () => {
      const fromHtml = await captureStderr(() => new BAPParser().parseResults(readResource('results', 'bap_results.html'), NO_FILTERS));
      expect(fromHtml.messages).to.have.length(2);
      expect(fromHtml.messages[0]).to.include('Skipping BAP custom award "Best of Show - Beer"');
      expect(fromHtml.messages[1]).to.include('Skipping BAP custom award "Best of Show - Mead & Cider"');

      const fromApi = await captureStderr(() => parseViaApi('https://beerawardsplatform.com/2025-ash-copper-state-cup/results', 'bap_results.json'));
      expect(fromApi.messages.map(message => message.match(/award "([^"]+)"/)?.[1])).to.deep.equal(['Best of Show - Mead & Cider', 'Best of Show - Beer']);
      expect(fromApi.messages.every(message => message.includes('unrecognized format'))).to.equal(true);
    });

    it('keeps the old saved fixture in agreement with its API response', async () => {
      const fromHtml = await new BAPParser().parseResults(readResource('results', 'bap_results.html'), NO_FILTERS);
      const fromApi = await parseViaApi(
        'https://beerawardsplatform.com/2025-ash-copper-state-cup/results',
        'bap_results.json'
      );

      expect(normalize(rowsOf(fromHtml))).to.deep.equal(normalize(rowsOf(fromApi)));
    });

    for (const variant of VARIANTS) {
      describeAshPage(variant);
      describeBoneyardPage(variant);
    }

    describe('failing loudly', () => {
      const rendered = readResource('results', 'bap_rendered_2026_ash_copper_state_cup.html');

      it('rejects the unrendered app shell', async () => {
        const shell = '<!doctype html><html><head><title>BAP</title><script src="/main.js"></script></head><body><div id="root"></div><noscript>You need to enable JavaScript to run this app.</noscript></body></html>';

        const error = await rejection(new BAPParser().parseResults(shell, NO_FILTERS));
        expect(error).to.be.instanceOf(BapHtmlStructureError);
        expect(error.message).to.match(/app shell/);
      });

      it('rejects a page whose medal markers are gone', async () => {
        const $ = cheerio.load(rendered);
        $('[title]').removeAttr('title');

        const error = await rejection(new BAPParser().parseResults($.html(), NO_FILTERS));
        expect(error).to.be.instanceOf(BapHtmlStructureError);
        expect(error.message).to.match(/not recognized/);
      });

      it('rejects an award row without a style line', async () => {
        const $ = cheerio.load(rendered);
        removeParagraphs($, '6A - ');

        const error = await rejection(new BAPParser().parseResults($.html(), NO_FILTERS));
        expect(error).to.be.instanceOf(BapHtmlStructureError);
        expect(error.message).to.match(/no style line/);
      });

      it('rejects a place that comes before an earlier one in a category', async () => {
        const swapped = rendered.replace('title="#1"', 'title="#9"');

        const error = await rejection(new BAPParser().parseResults(swapped, NO_FILTERS));
        expect(error).to.be.instanceOf(BapHtmlStructureError);
        expect(error.message).to.match(/out of order/);
      });

      it('reports an unusable page as empty when a URL is given and the API read nothing', async () => {
        const originalAdapter = axios.defaults.adapter;
        axios.defaults.adapter = async config => ({ config, data: { competition: { competitionId: 'id' }, results: { miniBos: {} } }, headers: {}, status: 200, statusText: 'OK' });

        try {
          const reader = new BAPParser();
          const { value } = await captureStderr(later(reader.parseResults.bind(reader), '<html><body></body></html>', NO_FILTERS, 'https://beerawardsplatform.com/x/results'));
          expect(value).to.equal(undefined);
        } finally {
          axios.defaults.adapter = originalAdapter;
        }
      });

      it('rejects a club-less award row that lost its medal title instead of using it as a heading', async () => {
        const $ = cheerio.load(rendered);
        const row = $('[title="#2"]').first().parent();
        row.find('[title]').removeAttr('title');
        row.find('p').filter((_i, element) => $(element).text().startsWith('Club:')).remove();

        const error = await rejection(new BAPParser().parseResults($.html(), NO_FILTERS));
        expect(error).to.be.instanceOf(BapHtmlStructureError);
        expect(error.message).to.match(/without a #N medal title/);
      });

      it('rejects an award row that lost its medal title instead of using it as a heading', async () => {
        const $ = cheerio.load(rendered);
        $('[title="#2"]').first().removeAttr('title');

        const error = await rejection(new BAPParser().parseResults($.html(), NO_FILTERS));
        expect(error).to.be.instanceOf(BapHtmlStructureError);
        expect(error.message).to.match(/without a #N medal title/);
      });
    });

    describe('page variations', () => {
      const rendered = readResource('results', 'bap_rendered_2026_ash_copper_state_cup.html');

      it('reads an entry name written as a heading', async () => {
        const $ = cheerio.load(rendered);
        $('p').filter((_i, element) => $(element).text() === 'Crimson Rye').each((_i, element) => { element.tagName = 'h6'; });

        expect(await parse($.html())).to.include('American Ales|1st|12|Crimson Rye|Alternative Grain Beer|Josh Reid|Missouri Mashers');
      });

      it('reads the brewer when a collaboration line comes first', async () => {
        const $ = cheerio.load(rendered);
        const collaboration = $('p').filter((_i, element) => $(element).text().startsWith('Collaboration with')).first();
        const brewer = collaboration.prev();
        collaboration.insertBefore(brewer);

        expect(await parse($.html())).to.include('Sour Wild Experimental and Wood-Aged Beers|1st|11|CZAR|Specialty Wood-Aged Beer|Gary Lynn|Arizona Society of Homebrewers');
      });

      it('keeps an entry name that looks like a style line', async () => {
        const html = rendered.replace('>Crimson Rye<', '>6A - Crimson Rye<');

        expect(await parse(html)).to.include('American Ales|1st|12|6A - Crimson Rye|Alternative Grain Beer|Josh Reid|Missouri Mashers');
      });

      it('keeps an entry named like the empty-position notice', async () => {
        const html = rendered.replace('>Crimson Rye<', '>No Awards Brown Ale<');

        expect(await parse(html)).to.include('American Ales|1st|12|No Awards Brown Ale|Alternative Grain Beer|Josh Reid|Missouri Mashers');
      });

      it('accepts two entries at the same place', async () => {
        const $ = cheerio.load(rendered);
        const hm = $('[title="#4"]').parent().filter((_i, element) => $(element).text().includes('APA'));
        hm.clone().insertAfter(hm);

        const rows = await parse($.html());
        expect(rows.filter(row => row.startsWith('American Ales|HM|'))).to.have.length(2);
      });

      it('ignores a title that is not exactly #N', async () => {
        const error = await rejection(parse(rendered.replaceAll('title="#', 'title="Rank #')));

        expect(error).to.be.instanceOf(BapHtmlStructureError);
        expect(error.message).to.match(/not recognized/);
      });

      it('reads a heading whose count sits in its own element', async () => {
        const html = readResource('results', 'bap_rendered_2026_boneyard_brew_off.html').replace('Amber Lager 17 Entries', 'Amber Lager</span><span>17 Entries');

        expect(await parse(html)).to.include('Amber Lager|1st|17|Smoke Wagon|Rauchbier|Taylor Shastid|Diablo Order of Zymiracle Enthusiasts (DOZE)');
      });

      it('reads a custom award under any heading, using the heading as the category', async () => {
        const html = rendered.replace('Best of Show - Mead &amp; Cider', 'Mead &amp; Cider Champion');
        expect(html).to.not.equal(rendered);

        const rows = await parse(html);
        expect(rows).to.have.length(18);
        expect(rows).to.include('Mead & Cider Champion|1st||ONE BAAAAD APPLE....|Cyser|Scott Estlund|The Brü Club');
        expect(rows.join('\n')).to.not.include('Best of Show - Mead');
      });

      it('reads a custom award without a club', async () => {
        const html = rendered.replace('\\ Club: The Brü Club', '');
        expect(html).to.not.equal(rendered);

        expect(await parse(html)).to.include('Best of Show - Mead & Cider|1st||ONE BAAAAD APPLE....|Cyser|Scott Estlund|');
      });

      it('skips a custom award line in another wording under a Best of Show heading, with a notice', async () => {
        const html = rendered.replace(/ONE BAAAAD APPLE[^<]*/, OLD_WORDING);

        const { messages, value } = await captureStderr(later(parse, html));
        expect(value).to.have.length(17);
        expect(value.join('\n')).to.not.include('Dan Acheson');
        expect(skipNotices(messages)).to.have.length(1);
        expect(messages[0]).to.include('"Best of Show - Mead & Cider"');
      });

      it('still rejects a damaged one-line row, under a "Best of Show" heading or any other', async () => {
        for (const heading of ['Best of Show - Mead Champion', 'Mead Champion']) {
          const html = rendered.replace('Best of Show - Mead &amp; Cider', heading).replace(/ONE BAAAAD APPLE[^<]*/, 'Scott Estlund won this one');

          // eslint-disable-next-line no-await-in-loop
          expect(await rejection(parse(html))).to.be.instanceOf(BapHtmlStructureError);
        }
      });

      it('reads an old-wording line under any heading as a custom award, skipping it with a notice', async () => {
        const html = rendered.replace('Best of Show - Mead &amp; Cider', 'Mead Champion').replace(/ONE BAAAAD APPLE[^<]*/, OLD_WORDING);

        const { messages, value } = await captureStderr(later(parse, html));
        expect(value).to.have.length(17);
        expect(skipNotices(messages)).to.have.length(1);
      });

      it('warns, and still returns every readable row, for an old-wording line that names the requested club', async () => {
        const line = 'Scott Estlund / Club: The Bru Club / ONE BAAAAD APPLE (M2A – Cyser';
        const html = rendered.replace(/ONE BAAAAD APPLE[^<]*/, line);
        const reader = new BAPParser();

        const { messages, value } = await captureStderr(later(reader.parseResults.bind(reader), html, { brewers: undefined, club: 'The Brü Club' }));
        expect(rowsOf(value)).to.include('Mead and Cider|1st|14|One Baaaad Apple....|Cyser|Scott Estlund|The Brü Club');
        expect(messages).to.have.length(1);
        expect(messages[0]).to.match(/^WARNING: BAP custom award "Best of Show - Mead & Cider".*could NOT be read and is missing from this output/);
        expect(messages[0]).to.include(line);
      });

      it('names a custom award without the count its heading shows', async () => {
        for (const heading of ['Best of Show - Mead &amp; Cider 4 Entries', 'Best of Show - Mead &amp; Cider (4)']) {
          const html = rendered.replace('Best of Show - Mead &amp; Cider', heading);
          expect(html).to.not.equal(rendered);

          // eslint-disable-next-line no-await-in-loop
          expect(await parse(html)).to.include(COPPER_CUSTOM_ROW);
        }
      });

      it('leaves out a Best of Show card or custom row that repeats a "Best of Show..." table row, keeping the table row', async () => {
        const winner = '<p>Winner</p><p>28A - Braggot</p><p>Pat Brewer, AZ</p><p>Club: ASH</p>';
        const row = (heading: string) => `<div><p>${heading}</p><div><span title="#1"></span><div>${winner}</div></div></div>`;
        const custom = '<div><p>Best of Show - Beer</p><div><span title="#1"></span><div><p>Winner \\ 28A - Braggot \\ Pat Brewer, AZ, USA \\ Club: ASH</p></div></div></div>';

        expect(await parse(`<div>${row('Best of Show - Beer 3 Entries')}${custom}</div>`)).to.deep.equal(['Best of Show - Beer|1st|3|Winner|Braggot|Pat Brewer|ASH']);
        expect(await parse(`<div>${row('Best of Show - Beer 3 Entries')}${custom.replace('Winner', 'WINNER')}</div>`)).to.have.length(1);
        expect(await parse(`<div>${custom}${row('Best of Show - Beer 3 Entries')}</div>`)).to.deep.equal(['Best of Show - Beer|1st|3|Winner|Braggot|Pat Brewer|ASH']);
        expect(await parse(`<div>${row('Best of Show 3 Entries')}${row('Best of Show - Beer 3 Entries')}</div>`)).to.have.length(2);
      });

      it('skips a "No award" custom position', async () => {
        const html = rendered.replace(/ONE BAAAAD APPLE[^<]*/, 'No award');

        const rows = await parse(html);
        expect(rows).to.have.length(17);
        expect(rows.join('\n')).to.not.include('Best of Show - Mead');
      });

      it('rejects a title-less row that has only a Club line and no style line', async () => {
        const $ = cheerio.load(rendered);
        const row = $('[title="#2"]').first().parent();
        row.find('[title]').removeAttr('title');
        row.find('p').filter((_i, element) => /^\d/.test($(element).text())).remove();

        const error = await rejection(parse($.html()));
        expect(error).to.be.instanceOf(BapHtmlStructureError);
        expect(error.message).to.match(/without a #N medal title/);
      });

      it('rejects a title-less "No award" row instead of using it as a heading', async () => {
        const $ = cheerio.load(rendered);
        const empty = $('em').first().closest('p').parent().parent().clone();
        empty.find('[title]').removeAttr('title');
        $('[title="#1"]').eq(5).parent().before(empty);

        const error = await rejection(parse($.html()));
        expect(error).to.be.instanceOf(BapHtmlStructureError);
        expect(error.message).to.match(/without a #N medal title/);
      });

      it('does not read style text as a heading', async () => {
        const $ = cheerio.load(rendered);
        const section = $('[title="#1"]').eq(2).parent().parent().parent();
        section.children().first().after('<style>.x{color:red}</style>');

        expect(await parse($.html())).to.include('Amber and Dark European Lager|1st|9|CDL|Czech Dark Lager|Ross Stuart|Arizona Society of Homebrewers');
      });

      it('ignores a title of #0 or with a leading zero', async () => {
        for (const title of ['#0', '#01']) {
          // eslint-disable-next-line no-await-in-loop
          const error = await rejection(parse(rendered.replaceAll(/title="#\d"/g, `title="${title}"`)));

          expect(error).to.be.instanceOf(BapHtmlStructureError);
        }
      });

      it('does not drop a row whose detail lines stopped being paragraphs', async () => {
        const $ = cheerio.load(rendered);
        for (const row of $('[title="#1"]').parent().toArray()) {
          for (const element of $(row).find('p').toArray().slice(1)) element.tagName = 'span';
        }

        const error = await rejection(parse($.html()));
        expect(error).to.be.instanceOf(BapHtmlStructureError);
      });

      it('does not drop a row that collapsed into one line without the custom-award separator', async () => {
        const $ = cheerio.load(rendered);
        const row = $('[title="#1"]').eq(2).parent();
        row.find('p').slice(1).remove();

        const error = await rejection(parse($.html()));
        expect(error).to.be.instanceOf(BapHtmlStructureError);
      });

      it('does not read script or noscript text as a heading', async () => {
        const $ = cheerio.load(rendered);
        const section = $('[title="#1"]').eq(2).parent().parent().parent();
        section.children().first().after('<script>var x = 1;</script><noscript>Enable JavaScript</noscript>');

        expect(await parse($.html())).to.include('Amber and Dark European Lager|1st|9|CDL|Czech Dark Lager|Ross Stuart|Arizona Society of Homebrewers');
      });

      it('ignores a title that only starts with #N', async () => {
        const error = await rejection(parse(rendered.replaceAll(/title="#(\d)"/g, 'title="#$1x"')));

        expect(error).to.be.instanceOf(BapHtmlStructureError);
        expect(error.message).to.match(/not recognized/);
      });

      it('finds the heading past an empty element between it and the rows', async () => {
        const $ = cheerio.load(readResource('results', 'bap_rendered_2026_boneyard_brew_off.html'));
        const firstMedal = $('[title="#1"]').filter((_i, element) => $(element).parent().text().includes('Smoke Wagon')).first();
        firstMedal.parent().parent().before('<div></div>');

        expect(await parse($.html())).to.include('Amber Lager|1st|17|Smoke Wagon|Rauchbier|Taylor Shastid|Diablo Order of Zymiracle Enthusiasts (DOZE)');
      });

      it('reads a singular "1 Entry" heading', async () => {
        const html = readResource('results', 'bap_rendered_2026_boneyard_brew_off.html').replace('Amber Lager 17 Entries', 'Amber Lager 1 Entry');

        expect(await parse(html)).to.include('Amber Lager|1st|1|Smoke Wagon|Rauchbier|Taylor Shastid|Diablo Order of Zymiracle Enthusiasts (DOZE)');
      });
    });
  });

  describe('Entry count in category names', () => {
    it('should read the parenthesised form', () => {
      expect(split('Porter and Stout (10)')).to.deep.equal({ categoryName: 'Porter and Stout', entryCount: '10' });
    });

    it('should read the "N Entries" form', () => {
      expect(split('Spiced and Specialty Mead 9 Entries')).to.deep.equal({ categoryName: 'Spiced and Specialty Mead', entryCount: '9' });
    });

    it('should read the singular "1 Entry" form', () => {
      expect(split('High Gravity 1 Entry')).to.deep.equal({ categoryName: 'High Gravity', entryCount: '1' });
    });

    it('should read a multi-digit count and keep commas in the name for later sanitising', () => {
      expect(split('Pale, Amber, and Brown American Ales 15 Entries')).to.deep.equal({
        categoryName: 'Pale, Amber, and Brown American Ales',
        entryCount: '15',
      });
    });

    it('should leave a name without a count alone', () => {
      expect(split('Mixed Styles')).to.deep.equal({ categoryName: 'Mixed Styles', entryCount: '' });
    });

    it('should not take a number that is part of the name for a count', () => {
      expect(split('Category 2')).to.deep.equal({ categoryName: 'Category 2', entryCount: '' });
      expect(split('Table 5 Entries Review (3)')).to.deep.equal({ categoryName: 'Table 5 Entries Review', entryCount: '3' });
    });

    it('should require a space between the count and the word Entries', () => {
      expect(split('Porter9 Entries')).to.deep.equal({ categoryName: 'Porter9 Entries', entryCount: '' });
      expect(split('Porter 9Entries')).to.deep.equal({ categoryName: 'Porter 9Entries', entryCount: '' });
    });

    it('should accept any whitespace around the count and ignore trailing whitespace', () => {
      expect(split('Mead 9\tEntries')).to.deep.equal({ categoryName: 'Mead', entryCount: '9' });
      expect(split('Mead\u00A09\u00A0Entries')).to.deep.equal({ categoryName: 'Mead', entryCount: '9' });
      expect(split('Mead 9 Entries  ')).to.deep.equal({ categoryName: 'Mead', entryCount: '9' });
      expect(split('Mead (9)  ')).to.deep.equal({ categoryName: 'Mead', entryCount: '9' });
    });

    it('should read the parenthesised form with no space before it', () => {
      expect(split('Porter(10)')).to.deep.equal({ categoryName: 'Porter', entryCount: '10' });
    });

    it('should not take a differently worded count for an entry count', () => {
      expect(split('Mead 9 Entrants')).to.deep.equal({ categoryName: 'Mead 9 Entrants', entryCount: '' });
    });

    it('should read a Best of Show card in the saved-HTML path, with no entry count', async () => {
      const card =
        '<div><p>Best of Show 3 Entries</p>' +
        '<div><span title="#1"></span><div><p>Winner</p><p>28A - Braggot</p><p>Pat Brewer, AZ</p><p>Club: ASH</p></div></div></div>';
      const result = await parser.parseResults(card, { brewers: undefined, club: undefined });
      expect(result?.data).to.equal('Best of Show|1st||Winner|Braggot|Pat Brewer|ASH');
    });

    it('should read each place of a multi-place custom award in the saved-HTML path', async () => {
      const line = (name: string) => `<p>${name} \\ 6B - Rauchbier \\ Pat Brewer, Town, ST, USA \\ Club: ASH</p>`;
      const card =
        '<div><p>Cup</p>' +
        `<div><span title="#1"></span><div>${line('First')}</div></div>` +
        '<div><span title="#2"></span><div><p>No award</p></div></div>' +
        `<div><span title="#3"></span><div>${line('Third')}</div></div></div>`;
      const result = await parser.parseResults(card, { brewers: undefined, club: undefined });

      expect(result?.data).to.equal('Cup|1st||First|Rauchbier|Pat Brewer|ASH\nCup|3rd||Third|Rauchbier|Pat Brewer|ASH');
    });

    it('should keep the count on a table whose heading only starts with "Best of Show"', async () => {
      const section = (heading: string, name: string) =>
        `<div><p>${heading}</p><div><span title="#1"></span><div><p>${name}</p><p>28A - Braggot</p><p>Pat Brewer, AZ</p><p>Club: ASH</p></div></div></div>`;
      const page = `<div>${section('Best of Show 3 Entries', 'Overall')}${section('Best of Show - Beer 3 Entries', 'Table')}</div>`;
      const result = await parser.parseResults(page, { brewers: undefined, club: undefined });

      expect(result?.data.split('\n')).to.deep.equal([
        'Best of Show|1st||Overall|Braggot|Pat Brewer|ASH',
        'Best of Show - Beer|1st|3|Table|Braggot|Pat Brewer|ASH',
      ]);
    });

    it('should fill the Entry Count column from the saved page (parenthesised)', async () => {
      const result = await parser.parseResults(html, { brewers: undefined, club: 'Arizona Society of Homebrewers' });
      const [row] = result!.data.split('\n');
      const cells = row.split('|');
      expect(cells[0]).to.not.match(/\(\d+\)/);
      expect(cells[2]).to.match(/^\d+$/);
    });

    it('should fill the Entry Count column from a "N Entries" card', async () => {
      const card =
        '<div><p>Spiced and Specialty Mead 9 Entries</p>' +
        '<div><span title="#1"></span><div><p>My Mead</p><p>28A - Braggot</p><p>Pat Brewer, AZ</p><p>Club: ASH</p></div></div></div>';
      const result = await parser.parseResults(card, { brewers: undefined, club: undefined });
      expect(result?.data).to.equal('Spiced and Specialty Mead|1st|9|My Mead|Braggot|Pat Brewer|ASH');
    });
  });
  describe('Entry count through the API path (stubbed axios)', () => {
    const miniBos = {
      a: { name: 'Spiced and Specialty Mead 9 Entries', positions: { 1: [entry('Mead, One', 'Pat, Brewer', 'The Brü Club')] } },
      b: { name: 'Pale, Amber, and Brown American Ales 15 Entries', positions: { 2: [entry('APA', 'Ross', 'The Brü Club')] } },
      c: { name: 'Porter and Stout (10)', positions: { 3: [entry('Porter', 'Sam', 'The Brü Club')] } },
      d: { name: 'High Gravity 1 Entry', positions: { 4: [entry('Barleywine', 'Lee', 'The Brü Club')] } },
      e: { name: 'Mystery Table', positions: { 1: [entry('Odd', 'Kim', 'The Brü Club')] } },
      f: { name: 'Cider\t8\tEntries', positions: { 1: [entry('Cyser', 'Jo', 'The Brü Club')] } },
      g: { name: 'Wheat\u00A05\u00A0Entries', positions: { 1: [entry('Hefe', 'Al', 'The Brü Club')] } },
      // A table that merely has "Best of Show" in its name is still a table: its medals are not dropped
      h: { name: 'Best of Show - Beer 3 Entries', positions: { 1: [entry('Kept', 'Nobody', 'The Brü Club')] } },
    };

    let originalAdapter: typeof axios.defaults.adapter;
    before(() => {
      originalAdapter = axios.defaults.adapter;
      axios.defaults.adapter = (async (config: { url?: string }) => ({
        config,
        data: String(config.url).includes('loadCompetitionInfo')
          ? { competition: { competitionId: 'abc' } }
          : { results: { miniBos } },
        headers: {},
        status: 200,
        statusText: 'OK',
      })) as never;
    });

    after(() => {
      axios.defaults.adapter = originalAdapter;
    });

    it('should emit numeric counts, comma-free names and the count-less category as full rows', async () => {
      const result = await parser.parseResults('', { brewers: undefined, club: undefined }, 'https://beerawardsplatform.com/k/results');
      expect(result?.data.split('\n')).to.deep.equal([
        'Spiced and Specialty Mead|1st|9|Mead One|Some Style|Pat Brewer|The Brü Club',
        'Pale Amber and Brown American Ales|2nd|15|APA|Some Style|Ross|The Brü Club',
        'Porter and Stout|3rd|10|Porter|Some Style|Sam|The Brü Club',
        'High Gravity|HM|1|Barleywine|Some Style|Lee|The Brü Club',
        'Mystery Table|1st||Odd|Some Style|Kim|The Brü Club',
        'Cider|1st|8|Cyser|Some Style|Jo|The Brü Club',
        'Wheat|1st|5|Hefe|Some Style|Al|The Brü Club',
        'Best of Show - Beer|1st|3|Kept|Some Style|Nobody|The Brü Club',
      ]);
    });
  });

  describe('Best of Show through the API path (stubbed axios)', () => {
    const miniBos = { a: { name: 'Porter (10)', positions: { 1: [entry('Mini', 'Pat', 'The Brü Club')] } } };
    const OTHER = 'Zed Brewer, Town, ST, USA';
    const award = (name: string, positions: unknown) => ({ name, positions });

    const run = async (results: unknown, filters: { brewers: string | undefined, club: string | undefined } = NO_FILTERS) => {
      const original = axios.defaults.adapter;
      axios.defaults.adapter = (async (config: { url?: string }) => ({
        config,
        data: String(config.url).includes('loadCompetitionInfo') ? { competition: { competitionId: 'abc' } } : { results },
        headers: {},
        status: 200,
        statusText: 'OK',
      })) as never;
      try {
        return rowsOf(await new BAPParser().parseResults('', filters, 'https://beerawardsplatform.com/k/results'));
      } finally {
        axios.defaults.adapter = original;
      }
    };

    it('emits bos positions as "Best of Show" with a blank entry count, 4th as HM', async () => {
      const bos = { positions: {
        1: [entry('A, One', 'Pat, Brewer', 'The Brü Club')],
        2: [entry('B', 'Lee', 'Club B')],
        3: [entry('C', 'Kim', '')],
        4: [entry('D', 'Al', 'Club D')],
      } };

      expect(await run({ bos, miniBos })).to.deep.equal([
        'Porter|1st|10|Mini|Some Style|Pat|The Brü Club',
        'Best of Show|1st||A One|Some Style|Pat Brewer|The Brü Club',
        'Best of Show|2nd||B|Some Style|Lee|Club B',
        'Best of Show|3rd||C|Some Style|Kim|',
        'Best of Show|HM||D|Some Style|Al|Club D',
      ]);
    });

    it('emits Best of Show when the only content is a custom award', async () => {
      const custom = { awards: [award('Best of Show - Mead & Cider', ['E \\ M2A - Cyser \\ Pat Brewer, Town, WI, USA \\ Club: X'])] };
      expect(await run({ custom })).to.deep.equal(['Best of Show - Mead & Cider|1st||E|Cyser|Pat Brewer|X']);
      expect(await run({ bos: { positions: { 1: [entry('A', 'Pat', 'X')] } } })).to.deep.equal(['Best of Show|1st||A|Some Style|Pat|X']);
    });

    it('reads custom positions in order, stripping the style id, commas and the city', async () => {
      const custom = { awards: [award('Best of Show - Beer, Big', [
        'First, Beer \\ 6B - Rauchbier \\ Pat Brewer, Town, ST, USA \\ Club: The Brü Club',
        'Second \\ 26C - Belgian Tripel \\ Lee Brewer \\ Club: Club B',
        'Third \\ M2A - Cyser \\ Kim, Town, ST, USA',
        'Fourth \\ 3D - Czech Dark Lager \\ Al, Town, ST, USA \\ Club: Club D',
      ])] };

      expect(await run({ custom })).to.deep.equal([
        'Best of Show - Beer Big|1st||First Beer|Rauchbier|Pat Brewer|The Brü Club',
        'Best of Show - Beer Big|2nd||Second|Belgian Tripel|Lee Brewer|Club B',
        'Best of Show - Beer Big|3rd||Third|Cyser|Kim|',
        'Best of Show - Beer Big|HM||Fourth|Czech Dark Lager|Al|Club D',
      ]);
    });

    it('numbers a custom place by its index, so a "No award" position leaves a gap', async () => {
      const custom = { awards: [award('Cup', ['No award', 'Two \\ 6B - Rauchbier \\ Pat, T, ST, USA \\ Club: X', 'no award given'])] };

      const { messages, value } = await captureStderr(() => run({ custom }));
      expect(value).to.deep.equal(['Cup|2nd||Two|Rauchbier|Pat|X']);
      expect(messages.filter(message => message.startsWith('Skipping BAP custom award'))).to.deep.equal([]);
    });

    it('skips a custom string in another wording with a notice naming the award and the text', async () => {
      const old = 'Dan Acheson / Club: Urban Knaves of Grain - ZE FRAHNCH (C1D – French Cider)';
      const custom = { awards: [award('Best of Show - Mead & Cider', [old]), award('Cup', ['Ok \\ 6B - Rauchbier \\ Pat, T, ST, USA \\ Club: X'])] };

      const { messages, value } = await captureStderr(() => run({ custom, miniBos }));
      expect(value).to.deep.equal(['Porter|1st|10|Mini|Some Style|Pat|The Brü Club', 'Cup|1st||Ok|Rauchbier|Pat|X']);
      expect(messages).to.have.length(1);
      expect(messages[0]).to.include('"Best of Show - Mead & Cider"').and.to.include(old);
    });

    it('rejects each malformed custom shape instead of guessing', async () => {
      const malformed = [
        'only one part',
        'a \\ b',
        'a \\ 6B - Style \\ Pat, T \\ Club: X \\ extra',
        'a \\ NoStyleId \\ Pat, T, ST, USA \\ Club: X',
        'a \\ 6B - Style \\ Pat, T, ST, USA \\ NotAClub',
        ' \\ 6B - Style \\ Pat, T, ST, USA',
        'a \\ 6B - Style \\  \\ Club: X',
        'a \\ 6B - Style \\ , Town \\ Club: X',
        String.raw`a \ 6B - Style \ Pat, T \ Club: X \ Club: Y`,
        String.raw`a \ 6B - Style \ Pat, T, ST, USA \ club: X`, // the label is case-sensitive
      ];
      const custom = { awards: [award('Cup', malformed)] };

      const { messages, value } = await captureStderr(() => run({ custom }));
      expect(value).to.deep.equal([]);
      expect(messages.filter(message => message.startsWith('Skipping BAP custom award "Cup"'))).to.have.length(malformed.length);
    });

    it('ignores absent, empty and oddly shaped bos and custom data', async () => {
      for (const extra of [{}, { bos: {}, custom: {} }, { bos: { positions: {} }, custom: { awards: [] } }, { bos: { positions: { 1: [] } } },
        ...[5, {}, [null], [5], 'none'].map(awards => ({ custom: { awards } })), { custom: { awards: [award('Cup', undefined), award('Cup', 'x'), award('Cup', [null, 5])] } }]) {
        // eslint-disable-next-line no-await-in-loop
        expect(await run({ miniBos, ...extra })).to.deep.equal(['Porter|1st|10|Mini|Some Style|Pat|The Brü Club']);
      }
    });

    it('applies the club filter to bos and custom rows alike', async () => {
      const bos = { positions: { 1: [entry('A', 'Pat', 'The Brü Club')], 2: [entry('B', 'Lee', 'Club B')] } };
      const custom = { awards: [award('Cup', [`C \\ 6B - Rauchbier \\ ${OTHER} \\ Club: Club B`, 'D \\ 6B - Rauchbier \\ Pat, T, ST, USA \\ Club: The Bru Club'])] };

      expect(await run({ bos, custom }, { brewers: undefined, club: 'The Brü Club' })).to.deep.equal([
        'Best of Show|1st||A|Some Style|Pat|The Brü Club',
        'Cup|2nd||D|Rauchbier|Pat|The Bru Club',
      ]);
      expect(await run({ bos, custom }, { brewers: undefined, club: 'Nobody Club' })).to.deep.equal([]);
    });

    it('applies the brewers filter to bos and custom rows', async () => {
      const bos = { positions: { 1: [entry('A', 'Pat', 'X')], 2: [entry('B', 'Lee', 'X')] } };
      const custom = { awards: [award('Cup', [`C \\ 6B - Rauchbier \\ ${OTHER}`, 'D \\ 6B - Rauchbier \\ Lee, T, ST, USA'])] };

      expect(await run({ bos, custom }, { brewers: 'Lee', club: undefined })).to.deep.equal([
        'Best of Show|2nd||B|Some Style|Lee|X',
        'Cup|2nd||D|Rauchbier|Lee|',
      ]);
    });

    it('skips a blank custom position without a notice, still using up its place', async () => {
      const custom = { awards: [award('Cup', ['', '  No award', 'Three \\ 6B - Rauchbier \\ Pat, T, ST, USA'])] };

      const { messages, value } = await captureStderr(() => run({ custom }));
      expect(value).to.deep.equal(['Cup|3rd||Three|Rauchbier|Pat|']);
      expect(skipNotices(messages)).to.deep.equal([]);
    });

    it('ignores positions and entries that are not entries', async () => {
      const bos = { positions: { 1: null, 2: {}, 3: [null, 'x', 7, entry('Ok', 'Pat', 'X')] } };
      const table = { a: null, b: { name: 'Bitter (5)', positions: { 1: [null, entry('B', 'Lee', 'X')] } } };

      expect(await run({ bos, miniBos: table })).to.deep.equal(['Bitter|1st|5|B|Some Style|Lee|X', 'Best of Show|3rd||Ok|Some Style|Pat|X']);
    });

    it('names a custom award from its trimmed name, or "Unknown Award" when it has none or not a string', async () => {
      const line = 'E \\ 6B - Rauchbier \\ Pat, T, ST, USA';
      const custom = { awards: [award('  Cup ', [line]), { positions: [line] }, award(5, [line]), award(' '.repeat(3), [line])] };

      expect(await run({ custom })).to.deep.equal([
        'Cup|1st||E|Rauchbier|Pat|',
        'Unknown Award|1st||E|Rauchbier|Pat|',
        'Unknown Award|1st||E|Rauchbier|Pat|',
        'Unknown Award|1st||E|Rauchbier|Pat|',
      ]);
    });

    it('strips commas from the custom club and style, and collapses whitespace inside the parts', async () => {
      const custom = { awards: [award('Cup', ['  Big   Beer \\ 6B -   St, Dry \\  Pat   Q,  T, ST, USA  \\  Club:   Foo, Inc  '])] };

      expect(await run({ custom })).to.deep.equal(['Cup|1st||Big Beer|St Dry|Pat Q|Foo Inc']);
    });

    it('emits tied Best of Show entries and identical rows once each', async () => {
      const same = entry('Same', 'Pat', 'X');
      const bos = { positions: { 1: [same, same], 2: [entry('Two', 'Lee', 'X'), entry('Three', 'Kim', 'X')] } };

      expect(await run({ bos })).to.deep.equal([
        'Best of Show|1st||Same|Some Style|Pat|X',
        'Best of Show|1st||Same|Some Style|Pat|X',
        'Best of Show|2nd||Two|Some Style|Lee|X',
        'Best of Show|2nd||Three|Some Style|Kim|X',
      ]);
    });

    const old = 'Stephen Schmitt / Club: The Brü Club / BAMBERG (6B – Rauchbier';
    const unrecognized = { awards: [award('Best of Show - Beer', [old])] };
    const OTHER_CLUB = { brewers: undefined, club: 'Other Club' };

    it('unrecognized line naming the --club or --brewers: warns that the medal is missing and returns the other rows', async () => {
      for (const filters of [{ brewers: undefined, club: 'The Brü Club' }, { brewers: undefined, club: 'the bru club' }, { brewers: 'Nobody, Pat, Stephen Schmitt', club: undefined }]) {
        // eslint-disable-next-line no-await-in-loop
        const { messages, value } = await captureStderr(later(run, { custom: unrecognized, miniBos }, filters));

        expect(value).to.deep.equal(['Porter|1st|10|Mini|Some Style|Pat|The Brü Club']);
        expect(messages).to.have.length(1);
        expect(messages[0]).to.match(/^WARNING: BAP custom award "Best of Show - Beer".*could NOT be read and is missing from this output/);
        expect(messages[0]).to.include(old);
      }
    });

    it('unrecognized line: a filter that only appears inside another word is not a mention', async () => {
      const cash = { awards: [award('Cup', ['Pat / Club: CASH CIDER / X (6B – Rauchbier'])] };
      const ashland = { awards: [award('Cup', ['Pat / Club: ASHLAND / X (6B – Rauchbier'])] };

      for (const custom of [cash, ashland]) {
        // eslint-disable-next-line no-await-in-loop
        const { messages } = await captureStderr(later(run, { custom }, { brewers: undefined, club: 'ASH' }));
        expect(messages[0]).to.match(/^Skipping BAP custom award "Cup"/);
        expect(messages[0]).to.not.include('WARNING');
      }
    });

    it('unrecognized line not naming the filter: skipped with a notice, and the empty-result message mentions it', async () => {
      const note = '(1 custom award line was skipped for an unrecognized format; see above)';
      const cases: [{ brewers: string | undefined, club: string | undefined }, string][] = [
        [OTHER_CLUB, 'Competition read, but no medals matched the given filters'],
        [NO_FILTERS, 'Competition read, but it has no published medals'],
      ];

      for (const [filters, final] of cases) {
        // eslint-disable-next-line no-await-in-loop
        const { messages, value } = await captureStderr(later(run, { custom: unrecognized }, filters));

        expect(value).to.deep.equal([]);
        expect(messages[0]).to.include('Skipping BAP custom award "Best of Show - Beer"');
        expect(messages).to.deep.equal([messages[0], `${final} ${note}`]);
      }
    });

    it('unrecognized lines: each is reported and counted once when the saved-page fallback re-reads them', async () => {
      const awards = { awards: [award('Best of Show - Beer', [OLD_WORDING]), award('Best of Show - Mead', [OLD_WORDING])] };
      const fetcher = (async (u: string) =>
        u.includes('loadCompetitionInfo') ? { competition: { competitionId: 'abc' } } : { results: { custom: awards } }) as typeof fetchJson;
      const section = (heading: string) =>
        `<div><p>${heading}</p><div><span title="#1"></span><div><p>${OLD_WORDING}</p></div></div></div>`;
      const page = `<div>${section('Best of Show - Beer')}${section('Best of Show - Mead')}</div>`;
      const reader = new BAPParser(fetcher);

      const { messages, value } = await captureStderr(later(reader.parseResults.bind(reader), page, NO_FILTERS, 'https://beerawardsplatform.com/k/results'));
      expect(value).to.equal(undefined);
      expect(skipNotices(messages)).to.have.length(2);
      expect(messages.at(-1)).to.equal('Competition read, but it has no published medals (2 custom award lines were skipped for an unrecognized format; see above)');
    });

    it('unrecognized line on a saved page with nothing else: the "no results" message mentions it', async () => {
      const card =
        '<div><p>Best of Show</p><div><span title="#1"></span><div>' +
        `<p>${OLD_WORDING}</p></div></div></div>`;

      const { messages, value } = await captureStderr(later(parser.parseResults.bind(parser), card, NO_FILTERS));
      expect(value).to.equal(undefined);
      expect(messages[1]).to.equal('No results found in BAP format (1 custom award line was skipped for an unrecognized format; see above)');
    });

    it('unrecognized line: concurrent calls on one parser report independent counts', async () => {
      const bodies: Record<string, unknown> = {
        one: { custom: { awards: [award('A', [old])] } },
        three: { custom: { awards: [award('A', [old, `${old} 2`, `${old} 3`])] } },
      };
      const fetcher = (async (u: string) => {
        const params = new URL(u).searchParams;
        const key = params.get('competitionKey') ?? params.get('competitionId') ?? '';
        await new Promise(resolve => { setTimeout(resolve, key === 'one' ? 5 : 1); });
        return u.includes('loadCompetitionInfo') ? { competition: { competitionId: key } } : { results: bodies[key] };
      }) as typeof fetchJson;
      const shared = new BAPParser(fetcher);

      const { messages } = await captureStderr(async () => Promise.all([
        shared.parseResults('', NO_FILTERS, 'https://beerawardsplatform.com/one/results'),
        shared.parseResults('', NO_FILTERS, 'https://beerawardsplatform.com/three/results'),
      ]));

      expect(messages.filter(message => message.includes('no published medals'))).to.have.members([
        'Competition read, but it has no published medals (1 custom award line was skipped for an unrecognized format; see above)',
        'Competition read, but it has no published medals (3 custom award lines were skipped for an unrecognized format; see above)',
      ]);
    });

    it('reads Collaboration parts after the brewer, before or after the club, and ignores them', async () => {
      const custom = { awards: [award('Cup', [
        String.raw`E \ 6B - Rauchbier \ Pat, T, ST, USA \ Collaboration with Lee \ Club: X`,
        String.raw`F \ 6B - Rauchbier \ Pat, T, ST, USA \ Club: X \ Collaboration with Lee`,
        String.raw`G \ 6B - Rauchbier \ Pat, T, ST, USA \ Collaboration with Lee`,
      ])] };

      expect(await run({ custom })).to.deep.equal([
        'Cup|1st||E|Rauchbier|Pat|X',
        'Cup|2nd||F|Rauchbier|Pat|X',
        'Cup|3rd||G|Rauchbier|Pat|',
      ]);
    });

    describe('a Best of Show table that BAP also lists as bos or custom', () => {
      const table = (name: string) => ({ t: { name, positions: { 1: [entry('Winner', 'Pat', 'X')], 2: [entry('Other', 'Lee', 'X')] } } });
      const winner = entry('Winner', 'Pat', 'X');

      it('emits the medal once, from the table with its count', async () => {
        const bos = { positions: { 1: [winner] } };
        const custom = { awards: [award('Best of Show - Beer', [String.raw`Winner \ 1A - Some Style \ Pat, T, ST, USA \ Club: X`])] };

        expect(await run({ bos, miniBos: table('Best of Show 3 Entries') })).to.deep.equal([
          'Best of Show|1st|3|Winner|Some Style|Pat|X',
          'Best of Show|2nd|3|Other|Some Style|Lee|X',
        ]);
        expect(await run({ custom, miniBos: table('Best of Show - Beer 3 Entries') })).to.deep.equal([
          'Best of Show - Beer|1st|3|Winner|Some Style|Pat|X',
          'Best of Show - Beer|2nd|3|Other|Some Style|Lee|X',
        ]);
      });

      it('compares repeated rows ignoring case, accents and spacing', async () => {
        const custom = { awards: [award('BEST OF SHOW - BEER', [String.raw`WÏNNER  \ 1A - SOME STYLE \ PAT, T, ST, USA \ Club: x`])] };
        expect(await run({ custom, miniBos: table('Best of Show - Beer 3 Entries') })).to.have.length(2);
      });

      it('keeps rows that differ in place, brewer, club or entry, tied rows, and rows repeating a table not named Best of Show', async () => {
        const bos = { positions: {
          1: [winner, entry('Winner', 'Kim', 'X'), entry('Winner', 'Pat', 'Y'), entry('Else', 'Pat', 'X')],
          2: [winner],
          3: [entry('New', 'Pat', 'X'), entry('New', 'Pat', 'X')],
        } };

        expect(await run({ bos, miniBos: table('Best of Show 3 Entries') })).to.deep.equal([
          'Best of Show|1st|3|Winner|Some Style|Pat|X',
          'Best of Show|2nd|3|Other|Some Style|Lee|X',
          'Best of Show|1st||Winner|Some Style|Kim|X',
          'Best of Show|1st||Winner|Some Style|Pat|Y',
          'Best of Show|1st||Else|Some Style|Pat|X',
          'Best of Show|2nd||Winner|Some Style|Pat|X',
          'Best of Show|3rd||New|Some Style|Pat|X',
          'Best of Show|3rd||New|Some Style|Pat|X',
        ]);

        const line = String.raw`Winner \ 1A - Some Style \ Pat, T, ST, USA \ Club: X`;
        for (const name of ['Cup', 'Mead Best of Show']) {
          // eslint-disable-next-line no-await-in-loop
          expect(await run({ custom: { awards: [award(name, [line])] }, miniBos: table(`${name} 3 Entries`) })).to.have.length(3);
        }
      });
    });
  });
});
