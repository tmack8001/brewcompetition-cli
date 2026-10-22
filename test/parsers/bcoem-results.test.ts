import { expect } from 'chai';
import fs from 'node:fs';
import path from 'node:path';

import { BCOEMParser } from '../../src/parsers/bcoem-parser.js';
import { BcoemHtmlStructureError } from '../../src/parsers/bcoem-results.js';
import { ParsedResults } from '../../src/parsers/types.js';
import { CLASS_VARIANTS, withClasses } from './class-variants.js';
import { rowsOf } from './filter-helpers.js';

const resource = (name: string): string => fs.readFileSync(path.join('test', 'resources', 'results', name), 'utf8');

const NONE = { brewers: undefined, club: undefined };
const parser = new BCOEMParser();
const parse = (html: string, filters: { brewers?: string; club?: string } = {}) =>
  parser.parseResults(html, { ...NONE, ...filters });

/**
 * Awaits something expected to reject.
 *
 * @param promise the pending call
 * @returns the error it rejected with
 */
async function rejection(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error as Error;
  }

  return expect.fail('expected a rejection');
}

interface Golden {
  added: Record<Case, string[]>;
  brewer: string;
  old: Record<Case, ParsedResults>;
}

type Case = 'brewers' | 'club' | 'none';

const golden: Record<string, Golden> = JSON.parse(resource('bcoem_results_golden.json'));

// The old parser selected on the winner-table class and produced `old`. The new
// one must reproduce those rows exactly; the only rows it may add are in `added`:
// Best of Show tables that newer BCOEM builds mark up without that class.
function expectGolden(actual: ParsedResults | undefined, expected: Golden, which: Case): void {
  const rows = rowsOf(actual);

  expect(actual?.header).to.equal(expected.old[which].header);
  expect(rows.filter(line => !expected.added[which].includes(line)), 'rows the old parser produced').to.deep.equal(rowsOf(expected.old[which]));
  expect(rows.filter(line => expected.added[which].includes(line)), 'rows the old parser missed').to.deep.equal(expected.added[which]);
}

describe('BCOEM results are read from structure, not classes', () => {
  for (const [fixture, expected] of Object.entries(golden)) {
    for (const variant of CLASS_VARIANTS) {
      describe(`${fixture} (${variant} attributes)`, () => {
        const html = withClasses(resource(fixture), variant);

        it('reproduces the unfiltered rows', async () => {
          expectGolden(await parse(html), expected, 'none');
        });

        it('reproduces the club-filtered rows', async () => {
          expectGolden(await parse(html, { club: 'The Bru Club' }), expected, 'club');
        });

        it('reproduces the brewer-filtered rows', async () => {
          expectGolden(await parse(html, { brewers: expected.brewer }), expected, 'brewers');
        });
      });
    }
  }

  it('has fixtures for both markup generations', () => {
    const missed = Object.values(golden).filter(entry => entry.added.none.length > 0);

    expect(missed.length).to.be.greaterThan(0);
    expect(Object.values(golden).filter(entry => entry.added.none.length === 0).length).to.be.greaterThan(0);
  });
});

const TABLE_HEAD = '<thead><tr><th>Place</th><th>Brewer</th><th>Entry Name</th><th>Style</th><th>Club</th></tr></thead>';
const row = (place: string, ...cells: string[]) =>
  `<tr><td><i></i> ${place}</td>${cells.map(cell => `<td>${cell}</td>`).join('')}</tr>`;
const table = (rows: string, head = TABLE_HEAD) => `<table>${head}<tbody>${rows}</tbody></table>`;
const page = (body: string) => `<html><body>${body}</body></html>`;

const STANDINGS = '<table><thead><tr><th>Place</th><th>Brewer</th><th>1st</th><th>2nd</th><th>3rd</th><th>Score</th><th>Club</th></tr></thead>' +
  '<tbody><tr><td>1st</td><td>Top Brewer</td><td>2</td><td>1</td><td>0</td><td>7</td><td>Top Club</td></tr></tbody></table>';

describe('BCOEM results table recognition', () => {
  it('reads a bare table under a heading with no wrapper', async () => {
    const result = await parse(page(`<h3>Table 3: Czech Lager (12 entries)</h3>${table(row('1st', 'A B', 'Pils', '3B: Czech Premium Pale Lager', 'Club X'))}`));

    expect(result?.header).to.equal('Table / Category|Place|Entry Count|Brewer|Entry Name|Style|Club');
    expect(rowsOf(result)).to.deep.equal(['Table 3: Czech Lager|1st|12|A B|Pils|3B: Czech Premium Pale Lager|Club X']);
  });

  it('reads any heading level and role=heading, and a table with no entry count', async () => {
    const result = await parse(page(
      `<h5>Cider</h5>${table(row('1st', 'A', 'e1', 's', 'c'))}` +
      `<div role="heading" aria-level="2"> 1. IPAs (7 entries) </div>${table(row('HM', 'B', 'e2', 's', 'c'))}`
    ));

    expect(rowsOf(result)).to.deep.equal(['Cider|1st||A|e1|s|c', '1. IPAs|HM|7|B|e2|s|c']);
  });

  it('accepts "Name" for the entry column and ignores header case and spacing', async () => {
    const head = '<thead><tr><th> PLACE </th><th>brewer</th><th>Name</th><th>Style</th><th>CLUB</th></tr></thead>';
    const result = await parse(page(`<h3>Stout</h3>${table(row('2nd', 'A', 'e', 's', 'c'), head)}`));

    expect(result?.header).to.equal('Table / Category|Place|Entry Count|brewer|Name|Style|CLUB');
    expect(rowsOf(result)).to.deep.equal(['Stout|2nd||A|e|s|c']);
  });

  it('reads a header that sits in the body rather than a thead', async () => {
    const result = await parse(page(`<h3>Stout</h3><table><tr><th>Place</th><th>Brewer</th><th>Entry Name</th><th>Style</th><th>Club</th></tr>${row('3rd', 'A', 'e', 's', 'c')}</table>`));

    expect(rowsOf(result)).to.deep.equal(['Stout|3rd||A|e|s|c']);
  });

  it('leaves out standings tables and unrelated tables', async () => {
    const result = await parse(page(
      '<table><tr><th>Menu</th><th>Link</th></tr><tr><td>a</td><td>b</td></tr></table>' +
      `<h3>Best Brewer (48 Participating Brewers)</h3>${STANDINGS}` +
      `<h3>Stout (4 entries)</h3>${table(row('1st', 'A', 'e', 's', 'c'))}`
    ));

    expect(rowsOf(result)).to.deep.equal(['Stout|1st|4|A|e|s|c']);
  });

  it('does not take a heading from a table that has its own', async () => {
    const result = await parse(page(
      `<h3>Stout</h3>${table(row('1st', 'A', 'e', 's', 'c'))}` +
      `<h3>Porter</h3>${table(row('1st', 'B', 'e', 's', 'c'))}`
    ));

    expect(rowsOf(result).map(line => line.split('|')[0])).to.deep.equal(['Stout', 'Porter']);
  });

  it('ignores a heading inside a medal table', async () => {
    const inner = row('1st', 'A', '<h4>Entry</h4>', 's', 'c');
    const result = await parse(page(`<h3>Stout</h3>${table(inner)}<h3>Porter</h3>${table(row('1st', 'B', 'e', 's', 'c'))}`));

    expect(rowsOf(result).map(line => line.split('|')[0])).to.deep.equal(['Stout', 'Porter']);
  });

  it('reads a table nested in a layout table', async () => {
    const result = await parse(page(`<table><tbody><tr><td><h3>Stout</h3>${table(row('1st', 'A', 'e', 's', 'c'))}</td></tr></tbody></table>`));

    expect(rowsOf(result)).to.deep.equal(['Stout|1st||A|e|s|c']);
  });

  it('removes the MHP badge and commas', async () => {
    const result = await parse(page(`<h3>Stout</h3>${table(row('1st MHP', 'Pat MHP', 'Big, Bold', 's', 'Club, Inc'))}`));

    expect(rowsOf(result)).to.deep.equal(['Stout|1st||Pat|Big Bold|s|Club Inc']);
  });

  it('keeps every column when a table has extra columns', async () => {
    const head = '<thead><tr><th>Place</th><th>Brewer</th><th>Entry Name</th><th>Style</th><th>Club</th><th>Score</th></tr></thead>';
    const result = await parse(page(`<h3>Stout</h3><table>${head}<tbody><tr><td>1st</td><td>A</td><td>e</td><td>s</td><td>c</td><td>44</td></tr></tbody></table>`));

    expect(result?.header).to.equal('Table / Category|Place|Entry Count|Brewer|Entry Name|Style|Club|Score');
    expect(rowsOf(result)).to.deep.equal(['Stout|1st||A|e|s|c|44']);
  });

  it('finds the brewer and club columns by label when they move', async () => {
    const head = '<thead><tr><th>Place</th><th>Club</th><th>Style</th><th>Entry Name</th><th>Brewer</th></tr></thead>';
    const body = '<tbody><tr><td>1st</td><td>The Brü Club</td><td>s</td><td>e</td><td>Pat</td></tr><tr><td>2nd</td><td>Other</td><td>s</td><td>e</td><td>Sam</td></tr></tbody>';
    const result = await parse(page(`<h3>Stout</h3><table>${head}${body}</table>`), { club: 'The Bru Club' });

    expect(rowsOf(result)).to.deep.equal(['Stout|1st||The Brü Club|s|e|Pat']);
  });
});

const one = (name: string) => table(row('1st', name, 'e', 's', 'c'));

describe('BCOEM heading and header edge cases', () => {
  it('does not let a heading inside a medal table name the next table', async () => {
    const html = page(`<h3>Stout</h3>${table(row('1st', 'A', '<h4>Inner</h4>', 's', 'c'))}${one('B')}`);

    expect(await rejection(parse(html))).to.be.instanceOf(BcoemHtmlStructureError);
  });

  it('does not give a medal table the heading an unrelated table already used', async () => {
    const html = page(`<h3>Stout</h3><table><tr><th>Menu</th></tr></table>${one('A')}`);

    expect(await rejection(parse(html))).to.be.instanceOf(BcoemHtmlStructureError);
  });

  it('throws on an empty heading', async () => {
    expect(await rejection(parse(page(`<h3> </h3>${one('A')}`)))).to.be.instanceOf(BcoemHtmlStructureError);
  });

  it('reads an h1 heading', async () => {
    expect(rowsOf(await parse(page(`<h1>Stout</h1>${one('A')}`)))).to.deep.equal(['Stout|1st||A|e|s|c']);
  });

  it('anchors the entry count to the end of the heading', async () => {
    expect(rowsOf(await parse(page(`<h3>Stout (7 entries) Special</h3>${one('A')}`)))).to.deep.equal(['Stout (7 entries) Special|1st||A|e|s|c']);
  });

  it('reads a header row that follows a title row', async () => {
    const html = page(`<h3>Stout</h3><table><thead><tr><th colspan="5">Winners</th></tr><tr><th>Place</th><th>Brewer</th><th>Entry Name</th><th>Style</th><th>Club</th></tr></thead><tbody>${row('1st', 'A', 'e', 's', 'c')}</tbody></table>`);

    expect(rowsOf(await parse(html))).to.deep.equal(['Stout|1st||A|e|s|c']);
  });

  it('matches --brewers against a moved brewer column', async () => {
    const head = '<thead><tr><th>Place</th><th>Club</th><th>Style</th><th>Entry Name</th><th>Brewer</th></tr></thead>';
    const body = '<tr><td>1st</td><td>c</td><td>s</td><td>e</td><td>Pat</td></tr><tr><td>2nd</td><td>Pat</td><td>s</td><td>e</td><td>Sam</td></tr>';

    expect(rowsOf(await parse(page(`<h3>Stout</h3><table>${head}<tbody>${body}</tbody></table>`), { brewers: 'Pat' }))).to.deep.equal(['Stout|1st||c|s|e|Pat']);
  });

  it('throws on a row with more cells than the header', async () => {
    const html = page(`<h3>Stout</h3>${table(row('1st', 'A', 'e', 's', 'c', 'extra'))}`);

    const error = await rejection(parse(html));

    expect(error.message).to.contain('does not match its header');
  });

  it('reads h2, h4 and h6 headings', async () => {
    const html = page(`<h2>Two</h2>${one('A')}<h4>Four</h4>${one('B')}<h6>Six</h6>${one('C')}`);

    expect(rowsOf(await parse(html)).map(line => line.split('|')[0])).to.deep.equal(['Two', 'Four', 'Six']);
  });

  it('reads an entry count with irregular spacing', async () => {
    expect(rowsOf(await parse(page(`<h3>Stout  (7 \u00A0 entries)</h3>${one('A')}`)))).to.deep.equal(['Stout|1st|7|A|e|s|c']);
  });

  it('keeps a table nested in a cell out of the rows', async () => {
    const html = page(`<h3>Stout</h3>${table(row('1st', 'A', '<table><tr><td>inner</td></tr></table>', 's', 'c'))}`);

    expect(rowsOf(await parse(html))).to.deep.equal(['Stout|1st||A|inner|s|c']);
  });

  it('removes every MHP badge in a cell', async () => {
    expect(rowsOf(await parse(page(`<h3>Stout</h3>${table(row('1st', 'A MHP', 'e MHP f MHP', 's', 'c'))}`)))).to.deep.equal(['Stout|1st||A|e f|s|c']);
  });

  it('collapses whitespace inside header labels', async () => {
    const head = '<thead><tr><th>Place</th><th>Brewer</th><th>Entry\n   Name</th><th>Style</th><th>Club</th></tr></thead>';

    expect(rowsOf(await parse(page(`<h3>Stout</h3>${table(row('1st', 'A', 'e', 's', 'c'), head)}`)))).to.deep.equal(['Stout|1st||A|e|s|c']);
  });

  it('does not take a header made of td cells for a medal table', async () => {
    const html = page(`<h3>Stout</h3><table><tr><td>Place</td><td>Brewer</td><td>Entry Name</td><td>Style</td><td>Club</td></tr>${row('1st', 'A', 'e', 's', 'c')}</table>`);

    expect(await rejection(parse(html))).to.be.instanceOf(BcoemHtmlStructureError);
  });

  it('trims and collapses header labels in the output header', async () => {
    const head = '<thead><tr><th>Place</th><th> Brewer </th><th>Entry\n  Name</th><th>Style</th><th>Club</th></tr></thead>';
    const result = await parse(page(`<h3>Stout</h3>${table(row('1st', 'A', 'e', 's', 'c'), head)}`));

    expect(result?.header).to.equal('Table / Category|Place|Entry Count|Brewer|Entry Name|Style|Club');
  });

  it('throws on a single-cell row', async () => {
    const html = page(`<h3>Stout</h3>${table('<tr><td colspan="5">No entries</td></tr>')}`);

    expect(await rejection(parse(html))).to.be.instanceOf(BcoemHtmlStructureError);
  });

  it('filters on the club as published, before commas are removed from the output', async () => {
    const html = page(`<h3>Stout</h3>${table(row('1st', 'A', 'e', 's', 'Club, Inc') + row('2nd', 'B', 'e', 's', 'Other'))}`);

    expect(rowsOf(await parse(html, { club: 'Club, Inc' }))).to.deep.equal(['Stout|1st||A|e|s|Club Inc']);
  });

  it('ignores a heading nested in any medal table, not only the first', async () => {
    const html = page(`<h3>Stout</h3>${one('A')}<h3>Porter</h3>${table(row('1st', 'B', '<h4>Inner</h4>', 's', 'c'))}${one('C')}`);

    expect(await rejection(parse(html))).to.be.instanceOf(BcoemHtmlStructureError);
  });

  it('throws when a later medal table has different columns', async () => {
    const head = '<thead><tr><th>Place</th><th>Club</th><th>Brewer</th><th>Entry Name</th><th>Style</th></tr></thead>';
    const html = page(`<h3>Stout</h3>${one('A')}<h3>Porter</h3>${table(row('1st', 'c', 'B', 'e', 's'), head)}`);
    const error = await rejection(parse(html));

    expect(error.message).to.contain('"Porter"');
  });

  for (const [name, head] of Object.entries({
    'a table that does not start with Place': '<th>Brewer</th><th>Place</th><th>Entry Name</th><th>Style</th><th>Club</th>',
    'a table with no Brewer column': '<th>Place</th><th>Entry Name</th><th>Style</th><th>Club</th>',
    'a table with no Club column': '<th>Place</th><th>Brewer</th><th>Entry Name</th><th>Style</th>',
    'a table with no Style column': '<th>Place</th><th>Brewer</th><th>Entry Name</th><th>Club</th>',
    'a table with no entry column': '<th>Place</th><th>Brewer</th><th>Style</th><th>Club</th>',
  })) {
    it(`does not treat ${name} as a medal table`, async () => {
      const html = page(`<h3>Stout</h3><table><thead><tr>${head}</tr></thead><tbody><tr>${'<td>x</td>'.repeat(head.split('<th>').length - 1)}</tr></tbody></table>`);

      expect(await rejection(parse(html))).to.be.instanceOf(BcoemHtmlStructureError);
    });
  }
});

describe('BCOEM co-brewers', () => {
  const html = page(`<h3>Stout (4 entries)</h3>${table(
    row('1st', 'Mike Kennedy MHP<br>Co-Brewer: Kerry Kennedy', 'e1', 's', 'c1') +
    row('2nd', 'Kerry Kennedy', 'e2', 's', 'c2')
  )}`);

  it('keeps the co-brewer in the brewer column', async () => {
    expect(rowsOf(await parse(html))[0]).to.equal('Stout|1st|4|Mike KennedyCo-Brewer: Kerry Kennedy|e1|s|c1');
  });

  it('matches --brewers against the named brewer, not the co-brewer line', async () => {
    expect(rowsOf(await parse(html, { brewers: 'Mike Kennedy' }))).to.deep.equal(['Stout|1st|4|Mike KennedyCo-Brewer: Kerry Kennedy|e1|s|c1']);
    expect(rowsOf(await parse(html, { brewers: 'Kerry Kennedy' }))).to.deep.equal(['Stout|2nd|4|Kerry Kennedy|e2|s|c2']);
  });
});

describe('BCOEM results on an unrecognised page', () => {
  it('throws on a page with no tables', async () => {
    const error = await rejection(parse('<html></html>'));

    expect(error).to.be.instanceOf(BcoemHtmlStructureError);
    expect(error.message).to.contain('Place, Brewer, Entry Name, Style and Club');
  });

  it('throws on a page with only standings tables', async () => {
    expect(await rejection(parse(page(`<h3>Best Club</h3>${STANDINGS}`)))).to.be.instanceOf(BcoemHtmlStructureError);
  });

  it('throws on a results page whose headers are not in English', async () => {
    const head = '<thead><tr><th>Lugar</th><th>Cervecero</th><th>Nombre</th><th>Estilo</th><th>Club</th></tr></thead>';

    expect(await rejection(parse(page(`<h3>Stout</h3>${table(row('1st', 'A', 'e', 's', 'c'), head)}`)))).to.be.instanceOf(BcoemHtmlStructureError);
  });

  it('throws on a medal table with no heading in front of it', async () => {
    const error = await rejection(parse(page(table(row('1st', 'A', 'e', 's', 'c')))));

    expect(error.message).to.contain('no heading');
  });

  it('throws when a second table has no heading of its own', async () => {
    const html = page(`<h3>Stout</h3>${table(row('1st', 'A', 'e', 's', 'c'))}${table(row('1st', 'B', 'e', 's', 'c'))}`);

    expect(await rejection(parse(html))).to.be.instanceOf(BcoemHtmlStructureError);
  });

  it('throws on a row that does not match the header', async () => {
    const error = await rejection(parse(page(`<h3>Stout</h3>${table('<tr><td>1st</td><td>A</td></tr>')}`)));

    expect(error.message).to.contain('does not match its header');
  });

  it('throws on a row with no place text', async () => {
    expect(await rejection(parse(page(`<h3>Stout</h3>${table(row('', 'A', 'e', 's', 'c'))}`)))).to.be.instanceOf(BcoemHtmlStructureError);
  });

  it('does not throw when the filters match nothing', async () => {
    const result = await parse(page(`<h3>Stout</h3>${table(row('1st', 'A', 'e', 's', 'c'))}`), { club: 'Nobody' });

    expect(rowsOf(result)).to.be.empty;
    expect(result?.header).to.contain('Brewer');
  });
});

describe('BCOEM results source', () => {
  const source = fs.readFileSync(path.join('src', 'parsers', 'bcoem-results.ts'), 'utf8');
  const calls = (names: string) => [...source.matchAll(new RegExp(`(?:^|[^\\w])(?:${names})\\(\\s*([^)]{0,40}\\)?)`, 'g'))].map(match => match[1]);

  it('calls only methods that read text, structure or arrays', () => {
    const used = new Set([...source.matchAll(/\.(\w+)\(/g)].map(match => match[1]));
    const allowed = new Set(['children', 'closest', 'filter', 'find', 'includes', 'indexOf', 'join', 'load', 'map', 'match', 'parents', 'push', 'replace', 'replaceAll', 'slice', 'some', 'split', 'stringify', 'text', 'toArray', 'toLowerCase', 'trim']);

    expect([...used].filter(name => !allowed.has(name))).to.deep.equal([]);
    expect(source).to.not.match(/bcoem-winner|attribs|attributes|\\[ux]|\w\[["'`]\w+["'`]]|]\[[^\]]/);
  });

  it('gives cheerio only element names and function filters', () => {
    for (const argument of calls(String.raw`\.children|\.closest|\.parents|\.find`)) expect(argument).to.match(/^(?:'(?:table|td|th|tr)'\)|Boolean\))/);
    for (const argument of calls(String.raw`\.filter`)) expect(argument).to.match(/^(?:\(?\w+\)? =>|Boolean)/);
    for (const argument of calls(String.raw`\$`)) expect(argument).to.match(/^(?:`\${HEADING},table`\)|(?:node|row|cell|candidate)\))/);
  });

  it('has no string with a bracket, class or id selector except the heading role', () => {
    const literals = [...source.matchAll(/(["'`])((?:(?!\1).)*)\1/g)].map(match => match[2].replaceAll(/\${[^}]*}/g, ''));

    for (const literal of literals.filter(item => item !== 'h1,h2,h3,h4,h5,h6,[role="heading"]' && !item.startsWith('./'))) {
      expect(literal, literal).to.not.match(/\[|(?:^|[\s\w(+,>~])[#.][A-Z_a-z-]/);
    }
  });
});
