import { expect } from 'chai';
import fs from 'node:fs';
import path from 'node:path';

import { HttpStatusError, fetchJson } from '../../src/http/fetch.js';
import { BAPParser, BapCompetitionNotFoundError } from '../../src/parsers/bap-parser.js';

const readFixture = (name: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), 'test/resources/api', name), 'utf8'));

function fixtureFetcher(requested: string[]): typeof fetchJson {
  return (async (u: string) => {
    requested.push(u);
    return u.includes('loadCompetitionInfo') ? readFixture('bap_competition_info.json') : readFixture('bap_results.json');
  }) as typeof fetchJson;
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
});
