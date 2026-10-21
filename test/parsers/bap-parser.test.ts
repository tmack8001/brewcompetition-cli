import axios from 'axios';
import { expect } from 'chai';
import fs from 'node:fs';
import path from 'node:path';

import { HttpStatusError, fetchJson } from '../../src/http/fetch.js';
import { BAPParser, BapCompetitionNotFoundError } from '../../src/parsers/bap-parser.js';
import { brewerOrClubExpectation, cell, expectOnlyClubRows, rowsOf } from './filter-helpers.js';

const readFixture = (name: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), 'test/resources/api', name), 'utf8'));

function fixtureFetcher(requested: string[]): typeof fetchJson {
  return (async (u: string) => {
    requested.push(u);
    return u.includes('loadCompetitionInfo') ? readFixture('bap_competition_info.json') : readFixture('bap_results.json');
  }) as typeof fetchJson;
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

    it('should keep the generic message when parsing saved HTML with no URL', async () => {
      const messages: string[] = [];
      const original = console.error;
      console.error = (...args: unknown[]) => { messages.push(args.join(' ')); };
      try {
        const result = await new BAPParser().parseResults('<html></html>', noFilters);
        expect(result).to.equal(undefined);
      } finally {
        console.error = original;
      }

      expect(messages).to.deep.equal(['No results found in BAP format']);
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

    it('should skip a Best of Show card in the saved-HTML path', async () => {
      const card =
        '<div class="MuiCard-root"><div class="MuiCardHeader-title">Best of Show 3 Entries</div>' +
        '<div class="jss95"><div class="jss99" title="1"></div><div class="jss96"><p>Skipped</p><p>Braggot</p><p>Pat Brewer, AZ</p><p>Club: ASH</p></div></div></div>';
      const result = await parser.parseResults(card, { brewers: undefined, club: undefined });
      expect(result).to.equal(undefined);
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
        '<div class="MuiCard-root"><div class="MuiCardHeader-title">Spiced and Specialty Mead 9 Entries</div>' +
        '<div class="jss95"><div class="jss99" title="1"></div><div class="jss96"><p>My Mead</p><p>Braggot</p><p>Pat Brewer, AZ</p><p>Club: ASH</p></div></div></div>';
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
      h: { name: 'Best of Show - Beer 3 Entries', positions: { 1: [entry('Skipped', 'Nobody', 'The Brü Club')] } },
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
      ]);
    });
  });
});
