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

  describe('Heavy Medal summary rows are not medals', () => {
    const none = { brewers: undefined, club: undefined };
    const load = (name: string): string => fs.readFileSync(path.join(process.cwd(), 'test/resources/results', name), 'utf8');
    const script = `var saReggieGroups=[ ["Stout","","",4,[]],["Heavy Medal - Brewer","","",0,[]],["Heavy Medal - Club","","",0,[]] ];
var aaReggieMedals=[
["1","0","1","Bill Edwards","Stout","16A: Sweet Stout","Milk Run","Hogtown Brewers (Gainesville, FL)"]
,["1","2","0","Bill Edwards","Heavy Medal - Brewer","3 medals:  1st:2 2nd:1","Total points: 8","","","6294","","",""]
,["2","2","0","Max Furth","Heavy Medal - Brewer","2 medals:  1st:2","Total points: 6","","","9533","","",""]
,["1","3","0","The Bru Club (Fresno, CA)","Heavy Medal - Club","14 medals:  1st:6 2nd:4 3rd:4","Total points: 30","","","0","","",""]
];`;

    it('emits only the medal, unfiltered', async () => {
      expect(rowsOf(await parser.parseResults(script, none))).to.deep.equal(['Stout|1st|4|Bill Edwards|16A: Sweet Stout|Milk Run|Hogtown Brewers']);
    });

    it('emits only the medal for --brewers "Bill Edwards" and for the club row\'s club', async () => {
      const expected = ['Stout|1st|4|Bill Edwards|16A: Sweet Stout|Milk Run|Hogtown Brewers'];

      expect(rowsOf(await parser.parseResults(script, { brewers: 'Bill Edwards', club: undefined }))).to.deep.equal(expected);
      expect(await parser.parseResults(script, { brewers: undefined, club: 'The Bru Club' })).to.equal(undefined);
    });

    it('still emits Best of Show (type 1) rows and drops the summaries in the trimmed Hot N Humid fixture', async () => {
      const result = await parser.parseResults(load('reggie_trimmed_2024_hot_n_humid.html'), none);

      expect(rowsOf(result)).to.have.length(11);
      expect(rowsOf(result)).to.include('Best Of Show - Beer|HM|0|Dick Wallace|6B: Rauchbier|Aint no hollaRauch girl aint no hollaRauch|The Bru Club');
      expect(result?.data).to.not.include('Heavy Medal');
      expect(result?.data).to.not.include('Total points');
    });

    it('counts exactly the medals of the existing full-page fixtures (JavaScript data and HTML table)', async () => {
      for (const name of ['reggie_results_raw.html', 'reggie_results.html']) {
        // eslint-disable-next-line no-await-in-loop
        const result = await parser.parseResults(load(name), none);

        expect(rowsOf(result), name).to.have.length(103);
        expect(result?.data, name).to.not.include('Heavy Medal');
      }

      expect(rowsOf(await parser.parseResults(noScript(load('reggie_results.html')), none))).to.have.length(103);
    });

    it('skips a Heavy Medal table in the rendered HTML', async () => {
      const html = `<table><tbody>
        <tr><td class="GroupHeader" colspan="5">Stout (4 entries)</td></tr>
        <tr><td>Bill Edwards</td><td>1st</td><td>16A: Sweet Stout</td><td>Milk Run</td><td>Hogtown Brewers</td></tr>
        <tr><td class="GroupHeader" colspan="5">Heavy Medal - Brewer</td></tr>
        <tr><td>Bill Edwards</td><td>1st</td><td>3 medals: 1st:2 2nd:1</td><td>Total points: 8</td><td>Hogtown Brewers</td></tr>
      </tbody></table>`;

      expect(rowsOf(await parser.parseResults(html, none))).to.deep.equal(['Stout|1st|4|Bill Edwards|16A: Sweet Stout|Milk Run|Hogtown Brewers']);
    });
  });

  describe('Entries published without a brew name', () => {
    const brü = { brewers: undefined, club: 'The Bru Club' };
    const load = (name: string): string => fs.readFileSync(path.join(process.cwd(), 'test/resources/results', name), 'utf8');

    it('emits a blank-named medal with an empty Brew Name (Hot N Humid 2024)', async () => {
      const result = await parser.parseResults(load('reggie_trimmed_2024_hot_n_humid.html'), brü);
      const row = rowsOf(result).find(line => cell(line, 3) === 'Ken Johnson');

      expect(row).to.equal('Czech Lager|2nd|3|Ken Johnson|3A: Czech Pale Lager||The Bru Club');
    });

    it('emits both blank-named medals of Ozarks Open Season 2024', async () => {
      const result = await parser.parseResults(load('reggie_trimmed_2024_ozark_open_season.html'), brü);
      const rows = rowsOf(result);

      expect(rows).to.include('American Pale Ale|3rd|4|Kurt LaPak|18B: American Pale Ale||The Bru Club');
      expect(rows).to.include('Amber Waves of Grain|3rd|5|Alex Zwerdling|19A: American Amber Ale||The Bru Club');
    });

    it('emits every medal of the page when unfiltered, blank-named ones included', async () => {
      const html = load('reggie_trimmed_2024_hot_n_humid.html');
      const result = await parser.parseResults(html, { brewers: undefined, club: undefined });

      expect(rowsOf(result)).to.have.length(html.match(/^,?\["\d+","[01]",/gm)?.length ?? -1);
      expect(rowsOf(result).filter(row => cell(row, 5) === '')).to.have.length(2);
    });

    it('keeps the seven columns of a blank-named row (the empty cell is not dropped)', async () => {
      const result = await parser.parseResults(load('reggie_trimmed_2024_ozark_open_season.html'), brü);

      for (const row of rowsOf(result)) expect(row.split('|')).to.have.length(7);
    });

    it('emits a blank-named medal from the HTML table fallback too', async () => {
      const html = `<table><tbody>
        <tr><td class="GroupHeader" colspan="5">Czech Lager (3 entries)</td></tr>
        <tr><td>Ken Johnson</td><td>2nd</td><td>3A: Czech Pale Lager</td><td></td><td>The Bru Club</td></tr>
      </tbody></table>`;
      const result = await parser.parseResults(html, brü);

      expect(rowsOf(result)).to.deep.equal(['Czech Lager|2nd|3|Ken Johnson|3A: Czech Pale Lager||The Bru Club']);
    });

    it('emits a medal whose club is blank when unfiltered, and filters it out by club', async () => {
      const html = `var saReggieGroups=[ ["Stout","","",4,[]] ];
var aaReggieMedals=[
["1","0","1","Pat Doe","Stout","16A: Sweet Stout","Milk Run",""]
,["2","0","1","Sam Roe","Stout","16A: Sweet Stout","","The Bru Club (Fresno, CA)"]
];`;
      const all = await parser.parseResults(html, { brewers: undefined, club: undefined });

      expect(rowsOf(all)).to.deep.equal([
        'Stout|1st|4|Pat Doe|16A: Sweet Stout|Milk Run|',
        'Stout|2nd|4|Sam Roe|16A: Sweet Stout||The Bru Club'
      ]);
      expect(rowsOf(await parser.parseResults(html, brü))).to.have.length(1);
    });
  });

  describe('Typographic quotes published as mojibake', () => {
    const load = (name: string): string => fs.readFileSync(path.join(process.cwd(), 'test/resources/results', name), 'utf8');
    const scott = 'Randall \u201CScott\u201D Gordon';

    it('fixture really holds the double-encoded name (not the repaired one)', () => {
      expect(load('reggie_trimmed_2024_hot_n_humid.html')).to.include('Randall \u00E2\u20AC\u0153Scott\u00E2\u20AC\u009D Gordon');
    });

    it('restores the curly quotes of a brewer name (Hot N Humid 2024)', async () => {
      const result = await parser.parseResults(load('reggie_trimmed_2024_hot_n_humid.html'), { brewers: undefined, club: 'The Bru Club' });

      expect(rowsOf(result)).to.include(`Spiced Beer|2nd|12|${scott}|30A: Spice/Herb/Vegetable Beer|Midnight Mocha|The Bru Club`);
      expect(result?.data).to.not.match(/[\u00C2\u00E2][\u0080-\u00BF\u20AC]/);
    });

    it('restores the quotes in every row of Ozarks Open Season 2024', async () => {
      const result = await parser.parseResults(load('reggie_trimmed_2024_ozark_open_season.html'), { brewers: undefined, club: 'The Bru Club' });

      expect(rowsOf(result).filter(row => cell(row, 3) === scott)).to.have.length(2);
    });

    it('matches --brewers written with the real quotes', async () => {
      const result = await parser.parseResults(load('reggie_trimmed_2024_hot_n_humid.html'), { brewers: scott, club: undefined });

      expect(rowsOf(result)).to.have.length(1);
      expect(cell(rowsOf(result)[0], 3)).to.equal(scott);
    });

    it('keeps every row splitting into seven pipe-delimited fields', async () => {
      const result = await parser.parseResults(load('reggie_trimmed_2024_hot_n_humid.html'), { brewers: undefined, club: undefined });

      for (const row of rowsOf(result)) expect(row.split('|')).to.have.length(7);
    });

    it('repairs the HTML table fallback as well, including the category used for the entry count', async () => {
      const html = `<table><tbody>
        <tr><td class="GroupHeader" colspan="5">Fruit/ Spice \u00E2\u20AC\u0153Mix\u00E2\u20AC\u009D (10 entries)</td></tr>
        <tr><td>Randall \u00E2\u20AC\u0153Scott\u00E2\u20AC\u009D Gordon</td><td>3rd</td><td>30A: Spice</td><td>Midnight Mocha</td><td>The Bru Club</td></tr>
      </tbody></table>`;
      const result = await parser.parseResults(html, { brewers: undefined, club: undefined });

      expect(rowsOf(result)).to.deep.equal([`Fruit/ Spice \u201CMix\u201D|3rd|10|${scott}|30A: Spice|Midnight Mocha|The Bru Club`]);
    });

    it('keeps the entry count of a category whose name needed repair (JavaScript data)', async () => {
      const html = `var saReggieGroups=[ ["Caf\u00C3\u00A9 Beer","","",9,[]] ];
var aaReggieMedals=[
["1","0","1","Pat Doe","Caf\u00C3\u00A9 Beer","1A: Cafe","Brew","The Bru Club (Fresno, CA)"]
];`;
      const result = await parser.parseResults(html, { brewers: undefined, club: undefined });

      expect(rowsOf(result)).to.deep.equal(['Caf\u00E9 Beer|1st|9|Pat Doe|1A: Cafe|Brew|The Bru Club']);
    });

    it('repairs a double-encoded brew name and club in both the HTML table and the JavaScript data', async () => {
      const bruClub = 'The Br\u00C3\u00BC Club';
      const table = `<table><tbody>
        <tr><td class="GroupHeader" colspan="5">Stout (4 entries)</td></tr>
        <tr><td>Pat Doe</td><td>1st</td><td>16A: Sweet Stout</td><td>Motor Boatin\u00E2\u20AC\u2122</td><td>${bruClub}</td></tr>
      </tbody></table>`;
      const script = `var saReggieGroups=[ ["Stout","","",4,[]] ];
var aaReggieMedals=[
["1","0","1","Pat Doe","Stout","16A: Sweet Stout","Motor Boatin\u00E2\u20AC\u2122","${bruClub} (Fresno, CA)"]
];`;

      for (const html of [table, script]) {
        // eslint-disable-next-line no-await-in-loop
        const result = await parser.parseResults(html, { brewers: undefined, club: 'The Br\u00FC Club' });

        expect(rowsOf(result)).to.deep.equal(['Stout|1st|4|Pat Doe|16A: Sweet Stout|Motor Boatin\u2019|The Br\u00FC Club']);
      }
    });
  });

  describe('Fields found by mutation testing', () => {
    const none = { brewers: undefined, club: undefined };

    it('emits a medal whose ShowLabel is empty and skips one with no brewer (JavaScript data)', async () => {
      const html = `var saReggieGroups=[ ["Stout","","",4,[]] ];
var aaReggieMedals=[
["1","0","","Pat Doe","Stout","16A: Sweet Stout","Milk Run","The Bru Club"]
,["2","0","1","","Stout","16A: Sweet Stout","Ghost","The Bru Club"]
];`;

      expect(rowsOf(await parser.parseResults(html, none))).to.deep.equal(['Stout|1st|4|Pat Doe|16A: Sweet Stout|Milk Run|The Bru Club']);
    });

    it('repairs a double-encoded style in the JavaScript data and in the HTML table', async () => {
      const style = '16A: Sweet Stout \u00E2\u20AC\u201C Caf\u00C3\u00A9';
      const expected = ['Stout|1st|4|Pat Doe|16A: Sweet Stout \u2013 Caf\u00E9|Milk Run|The Bru Club'];
      const script = `var saReggieGroups=[ ["Stout","","",4,[]] ];
var aaReggieMedals=[
["1","0","1","Pat Doe","Stout","${style}","Milk Run","The Bru Club"]
];`;
      const table = `<table><tbody>
        <tr><td class="GroupHeader" colspan="5">Stout (4 entries)</td></tr>
        <tr><td>Pat Doe</td><td>1st</td><td>${style}</td><td>Milk Run</td><td>The Bru Club</td></tr>
      </tbody></table>`;

      expect(rowsOf(await parser.parseResults(script, none))).to.deep.equal(expected);
      expect(rowsOf(await parser.parseResults(table, none))).to.deep.equal(expected);
    });
  });
});
