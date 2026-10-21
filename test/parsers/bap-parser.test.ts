import type { Element } from 'cheerio';

import axios from 'axios';
import { expect } from 'chai';
import * as cheerio from 'cheerio';
import fs from 'node:fs';
import path from 'node:path';

import { HttpStatusError, fetchJson } from '../../src/http/fetch.js';
import { BAPParser, BapCompetitionNotFoundError, BapHtmlStructureError } from '../../src/parsers/bap-parser.js';

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

const rowsOf = (result: { data: string } | undefined): string[] => (result ? result.data.split('\n') : []);

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
    rows: 13,
    url: 'https://beerawardsplatform.com/2026-ash-copper-state-cup/results',
  },
  {
    api: 'bap_trimmed_results_2026_boneyard_brew_off.json',
    html: 'bap_rendered_2026_boneyard_brew_off.html',
    rows: 9,
    url: 'https://beerawardsplatform.com/the-2026-boneyard-brew-off/results',
  },
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

    it('skips Best of Show sections and positions with no award', () => {
      expect(rows.some(row => row.includes('Bamberg'))).to.equal(false);
      expect(rows.some(row => row.includes('ONE BAAAAD APPLE'))).to.equal(false);
      expect(rows.filter(row => row.startsWith('Amber and Dark European Lager|'))).to.have.length(3);
    });

    it('reads the brewer ahead of a collaboration line and the club after it', () => {
      expect(rows).to.include('Sour Wild Experimental and Wood-Aged Beers|1st|11|CZAR|Specialty Wood-Aged Beer|Gary Lynn|Arizona Society of Homebrewers');
    });

    it('filters by club', async () => {
      const html = withClasses(readResource('results', 'bap_rendered_2026_ash_copper_state_cup.html'), variant);
      const result = await new BAPParser().parseResults(html, { brewers: undefined, club: 'The Brü Club' });

      expect(rowsOf(result)).to.deep.equal(['Mead and Cider|1st|14|One Baaaad Apple....|Cyser|Scott Estlund|The Brü Club']);
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
  });
}

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
          return [['Cat', '1st', '9', 'Beer', 'Style', 'Brewer', 'Club']];
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
      const original = console.error;
      console.error = () => {};
      let thrown: unknown;
      try {
        await new BAPParser(fetcher).parseResults('<html><div id="root"></div></html>', noFilters, url);
      } catch (error) {
        thrown = error;
      } finally {
        console.error = original;
      }

      expect(thrown, 'expected a rejection').to.be.instanceOf(HttpStatusError);
      expect((thrown as HttpStatusError).status).to.equal(500);
    });

    it('should say the filters matched nothing when the competition was read', async () => {
      const messages: string[] = [];
      const original = console.error;
      console.error = (...args: unknown[]) => { messages.push(args.join(' ')); };
      try {
        const result = await new BAPParser(fixtureFetcher([])).parseResults('', { brewers: 'Nobody At All', club: undefined }, url);
        expect(result).to.equal(undefined);
      } finally {
        console.error = original;
      }

      expect(messages).to.deep.equal(['Competition read, but no medals matched the given filters']);
    });

    it('should say the filters matched nothing for a club filter too', async () => {
      const messages: string[] = [];
      const original = console.error;
      console.error = (...args: unknown[]) => { messages.push(args.join(' ')); };
      try {
        await new BAPParser(fixtureFetcher([])).parseResults('', { brewers: undefined, club: 'No Such Club' }, url);
      } finally {
        console.error = original;
      }

      expect(messages).to.deep.equal(['Competition read, but no medals matched the given filters']);
    });

    it('should treat a results response with no medal list as published-nothing, not as a failure', async () => {
      const messages: string[] = [];
      const fetcher = (async (u: string) =>
        u.includes('loadCompetitionInfo') ? readFixture('bap_competition_info.json') : { results: {} }) as typeof fetchJson;
      const original = console.error;
      console.error = (...args: unknown[]) => { messages.push(args.join(' ')); };
      try {
        const result = await new BAPParser(fetcher).parseResults('', noFilters, url);
        expect(result).to.equal(undefined);
      } finally {
        console.error = original;
      }

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
      const messages: string[] = [];
      const fetcher = (async (u: string) =>
        u.includes('loadCompetitionInfo') ? readFixture('bap_competition_info.json') : { results: { miniBos: {} } }) as typeof fetchJson;
      const original = console.error;
      console.error = (...args: unknown[]) => { messages.push(args.join(' ')); };
      try {
        const result = await new BAPParser(fetcher).parseResults('', noFilters, url);
        expect(result).to.equal(undefined);
      } finally {
        console.error = original;
      }

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
      const original = console.error;
      console.error = () => {};
      try {
        const result = await new BAPParser(fetcher).parseResults(html, noFilters, url);
        expect(result?.data).to.include('Christian Chandler');
      } finally {
        console.error = original;
      }
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
        const originalError = console.error;
        console.error = () => {};

        try {
          const result = await new BAPParser().parseResults('<html><body></body></html>', NO_FILTERS, 'https://beerawardsplatform.com/x/results');
          expect(result).to.equal(undefined);
        } finally {
          console.error = originalError;
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

      it('skips a custom award whose single line lists its fields', async () => {
        const html = rendered.replace('Best of Show - Mead &amp; Cider', 'Mead &amp; Cider Champion');
        expect(html).to.not.equal(rendered);

        const rows = await parse(html);
        expect(rows).to.have.length(13);
        expect(rows.some(row => row.includes('ONE BAAAAD APPLE'))).to.equal(false);
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
});
