import { expect } from 'chai';
import fs from 'node:fs';
import path from 'node:path';

import { ReggieParser } from '../../src/parsers/reggie-parser.js';
import { brewerOrClubExpectation, cell, expectOnlyClubRows, rowsOf } from './filter-helpers.js';

/**
 * Hides the page's JavaScript medal data so the parser takes the HTML table path.
 *
 * @param html the saved page
 * @returns the page with the data variables renamed
 */
function noScript(html: string): string {
  return html.replace('var aaReggieMedals=', 'var disabledMedals=').replace('var saReggieGroups=', 'var disabledGroups=');
}

describe('Reggie Parser', () => {
  let parser: ReggieParser;
  let htmlRendered: string;
  let htmlRaw: string;

  before(() => {
    parser = new ReggieParser();
    const htmlRenderedPath = path.join(process.cwd(), 'test/resources/results/reggie_results.html');
    const htmlRawPath = path.join(process.cwd(), 'test/resources/results/reggie_results_raw.html');
    htmlRendered = fs.readFileSync(htmlRenderedPath, 'utf8');
    htmlRaw = fs.readFileSync(htmlRawPath, 'utf8');
  });

  describe('Rendered HTML (saved page)', () => {
    it('should parse results from rendered Reggie HTML', async () => {
      const result = await parser.parseResults(htmlRendered, { brewers: undefined, club: undefined });
      
      expect(result).to.not.be.undefined;
      expect(result?.header).to.include('Brewer');
      expect(result?.header).to.include('Medal');
      expect(result?.header).to.include('Style');
      expect(result?.data).to.include('Donald Schneider');
      expect(result?.data).to.include('American Lager');
    });

    it('should filter by brewer name', async () => {
      const result = await parser.parseResults(htmlRendered, { brewers: 'Donald Schneider', club: undefined });
      
      expect(result).to.not.be.undefined;
      expect(result?.data).to.include('Donald Schneider');
      expect(result?.data).to.not.include('Ryan Wankel');
    });

    it('should filter by club', async () => {
      const result = await parser.parseResults(htmlRendered, { brewers: undefined, club: 'Lakewood Fermentation Club' });
      
      expect(result).to.not.be.undefined;
      expect(result?.data).to.include('Lakewood Fermentation Club');
    });
  });

  describe('Raw JavaScript (live page)', () => {
    it('should parse results from raw JavaScript data', async () => {
      const result = await parser.parseResults(htmlRaw, { brewers: undefined, club: undefined });
      
      expect(result).to.not.be.undefined;
      expect(result?.header).to.include('Brewer');
      expect(result?.header).to.include('Medal');
      expect(result?.header).to.include('Style');
      expect(result?.data).to.include('Donald Schneider');
      expect(result?.data).to.include('American Lager');
    });

    it('should filter by brewer name from JavaScript data', async () => {
      const result = await parser.parseResults(htmlRaw, { brewers: 'Donald Schneider', club: undefined });
      
      expect(result).to.not.be.undefined;
      expect(result?.data).to.include('Donald Schneider');
      expect(result?.data).to.not.include('Ryan Wankel');
    });

    it('should filter by club from JavaScript data', async () => {
      const result = await parser.parseResults(htmlRaw, { brewers: undefined, club: 'Lakewood Fermentation Club' });
      
      expect(result).to.not.be.undefined;
      expect(result?.data).to.include('Lakewood Fermentation Club');
    });
  });

  describe('Diacritic-insensitive club filter (rendered page, JavaScript data)', () => {
    const none = { brewers: undefined, club: undefined };

    it('matches an accented published club with an unaccented filter', async () => {
      const accented = htmlRendered.replaceAll('Lakewood Fermentation Club', 'Lakéwood Fermentation Club');
      const full = await parser.parseResults(accented, none);
      const result = await parser.parseResults(accented, { brewers: undefined, club: 'Lakewood Fermentation Club' });

      expectOnlyClubRows(full, result, 'Lakéwood Fermentation Club');
    });

    it('matches an unaccented published club with an accented filter', async () => {
      const full = await parser.parseResults(htmlRendered, none);
      const result = await parser.parseResults(htmlRendered, { brewers: undefined, club: 'Lakéwood Fermentation Club' });

      expectOnlyClubRows(full, result, 'Lakewood Fermentation Club');
    });

    it('matches regardless of case and spacing', async () => {
      const full = await parser.parseResults(htmlRendered, none);
      const result = await parser.parseResults(htmlRendered, { brewers: undefined, club: '  LAKEWOOD  FERMENTATION CLUB ' });

      expectOnlyClubRows(full, result, 'Lakewood Fermentation Club');
    });

    it('returns nothing for a non-matching club', async () => {
      const result = await parser.parseResults(htmlRendered, { brewers: undefined, club: 'No Such Club' });

      expect(rowsOf(result)).to.be.empty;
    });

    it('does not treat a filter that is a prefix of the club as a match', async () => {
      const result = await parser.parseResults(htmlRendered, { brewers: undefined, club: 'Lakewood Fermentation' });

      expect(rowsOf(result)).to.be.empty;
    });

    it('does not treat a filter that extends the club name as a match', async () => {
      const result = await parser.parseResults(htmlRendered, { brewers: undefined, club: 'Lakewood Fermentation Club Extra' });

      expect(rowsOf(result)).to.be.empty;
    });

    it('does not let a blank club filter match entries', async () => {
      const result = await parser.parseResults(htmlRendered, { brewers: undefined, club: ' \u0301 ' });

      expect(rowsOf(result)).to.be.empty;
    });
  });

  describe('Diacritic-insensitive club filter (raw page, JavaScript data)', () => {
    const none = { brewers: undefined, club: undefined };

    it('matches an accented published club with an unaccented filter', async () => {
      const accented = htmlRaw.replaceAll('Lakewood Fermentation Club', 'Lakéwood Fermentation Club');
      const full = await parser.parseResults(accented, none);
      const result = await parser.parseResults(accented, { brewers: undefined, club: 'Lakewood Fermentation Club' });

      expectOnlyClubRows(full, result, 'Lakéwood Fermentation Club');
    });

    it('matches an unaccented published club with an accented filter', async () => {
      const full = await parser.parseResults(htmlRaw, none);
      const result = await parser.parseResults(htmlRaw, { brewers: undefined, club: 'Lakéwood Fermentation Club' });

      expectOnlyClubRows(full, result, 'Lakewood Fermentation Club');
    });

    it('matches regardless of case and spacing', async () => {
      const full = await parser.parseResults(htmlRaw, none);
      const result = await parser.parseResults(htmlRaw, { brewers: undefined, club: '  LAKEWOOD  FERMENTATION CLUB ' });

      expectOnlyClubRows(full, result, 'Lakewood Fermentation Club');
    });

    it('returns nothing for a non-matching club', async () => {
      const result = await parser.parseResults(htmlRaw, { brewers: undefined, club: 'No Such Club' });

      expect(rowsOf(result)).to.be.empty;
    });

    it('does not treat a filter that is a prefix of the club as a match', async () => {
      const result = await parser.parseResults(htmlRaw, { brewers: undefined, club: 'Lakewood Fermentation' });

      expect(rowsOf(result)).to.be.empty;
    });

    it('does not treat a filter that extends the club name as a match', async () => {
      const result = await parser.parseResults(htmlRaw, { brewers: undefined, club: 'Lakewood Fermentation Club Extra' });

      expect(rowsOf(result)).to.be.empty;
    });

    it('does not let a blank club filter match entries', async () => {
      const result = await parser.parseResults(htmlRaw, { brewers: undefined, club: ' \u0301 ' });

      expect(rowsOf(result)).to.be.empty;
    });
  });

  describe('Diacritic-insensitive club filter (HTML table fallback)', () => {
    const none = { brewers: undefined, club: undefined };

    it('matches an accented published club with an unaccented filter', async () => {
      const accented = noScript(htmlRendered).replaceAll('Lakewood Fermentation Club', 'Lakéwood Fermentation Club');
      const full = await parser.parseResults(accented, none);
      const result = await parser.parseResults(accented, { brewers: undefined, club: 'Lakewood Fermentation Club' });

      expectOnlyClubRows(full, result, 'Lakéwood Fermentation Club');
    });

    it('matches an unaccented published club with an accented filter', async () => {
      const full = await parser.parseResults(noScript(htmlRendered), none);
      const result = await parser.parseResults(noScript(htmlRendered), { brewers: undefined, club: 'Lakéwood Fermentation Club' });

      expectOnlyClubRows(full, result, 'Lakewood Fermentation Club');
    });

    it('matches regardless of case and spacing', async () => {
      const full = await parser.parseResults(noScript(htmlRendered), none);
      const result = await parser.parseResults(noScript(htmlRendered), { brewers: undefined, club: '  LAKEWOOD  FERMENTATION CLUB ' });

      expectOnlyClubRows(full, result, 'Lakewood Fermentation Club');
    });

    it('returns nothing for a non-matching club', async () => {
      const result = await parser.parseResults(noScript(htmlRendered), { brewers: undefined, club: 'No Such Club' });

      expect(rowsOf(result)).to.be.empty;
    });

    it('does not treat a filter that is a prefix of the club as a match', async () => {
      const result = await parser.parseResults(noScript(htmlRendered), { brewers: undefined, club: 'Lakewood Fermentation' });

      expect(rowsOf(result)).to.be.empty;
    });

    it('does not treat a filter that extends the club name as a match', async () => {
      const result = await parser.parseResults(noScript(htmlRendered), { brewers: undefined, club: 'Lakewood Fermentation Club Extra' });

      expect(rowsOf(result)).to.be.empty;
    });

    it('does not let a blank club filter match entries', async () => {
      const result = await parser.parseResults(noScript(htmlRendered), { brewers: undefined, club: ' \u0301 ' });

      expect(rowsOf(result)).to.be.empty;
    });
  });

  describe('HTML table fallback fixture', () => {
    it('is really parsed through the HTML path', async () => {
      const viaHtml = await parser.parseResults(noScript(htmlRendered), { brewers: undefined, club: undefined });

      expect(rowsOf(viaHtml)).to.not.be.empty;
      expect(noScript(htmlRendered)).to.not.match(/var aaReggieMedals=/);
    });
  });

  describe('Brewers filter (HTML table fallback)', () => {
    const none = { brewers: undefined, club: undefined };
    const club = 'Lakewood Fermentation Club';

    it('keeps only the named brewer', async () => {
      const result = await parser.parseResults(noScript(htmlRendered), { brewers: 'donald  SCHNEIDER', club: undefined });

      expect(rowsOf(result)).to.not.be.empty;
      expect(rowsOf(result).every(row => cell(row, 3) === 'Donald Schneider')).to.equal(true);
    });

    it('includes entries matching the brewer or the club', async () => {
      const full = await parser.parseResults(noScript(htmlRendered), none);
      const result = await parser.parseResults(noScript(htmlRendered), { brewers: 'Donald Schneider', club });
      const expected = rowsOf(full).filter(row => cell(row, 3) === 'Donald Schneider' || row.endsWith(`|${club}`));

      expect(expected.length).to.be.greaterThan(rowsOf(await parser.parseResults(noScript(htmlRendered), { brewers: undefined, club })).length);
      expect(rowsOf(result)).to.deep.equal(expected);
    });
  });

  describe('Brewers or club (JavaScript data)', () => {
    const none = { brewers: undefined, club: undefined };


    it('includes entries matching the brewer or the club', async () => {
      const full = await parser.parseResults(htmlRaw, none);
      const { brewer, expected } = brewerOrClubExpectation(full, 3, 'Lakewood Fermentation Club');
      const result = await parser.parseResults(htmlRaw, { brewers: brewer, club: 'Lakewood Fermentation Club' });

      expect(rowsOf(result)).to.deep.equal(expected);
    });
  });
});
