import { expect } from 'chai';

import { ParsedResults } from '../../src/parsers/types.js';

/**
 * Splits parsed output into rows.
 *
 * @param result parser output
 * @returns the non-empty data rows
 */
export function rowsOf(result: ParsedResults | undefined): string[] {
  return (result?.data ?? '').split('\n').filter(Boolean);
}

/**
 * Asserts a club-filtered parse returned exactly the rows of the unfiltered
 * parse whose (last) club column equals `club`: not merely "something", so a
 * filter that is switched off, or too loose, is caught.
 *
 * @param unfiltered the unfiltered parse of the same page
 * @param filtered the filtered parse
 * @param club the club name as published on the page
 * @returns the matched rows
 */
export function expectOnlyClubRows(unfiltered: ParsedResults | undefined, filtered: ParsedResults | undefined, club: string): string[] {
  const expected = rowsOf(unfiltered).filter(row => row.endsWith(`|${club}`));
  expect(expected, 'fixture has rows for the club').to.not.be.empty;
  expect(rowsOf(unfiltered).length, 'filter must narrow the result').to.be.greaterThan(expected.length);
  expect(rowsOf(filtered)).to.deep.equal(expected);

  return expected;
}

/**
 * Reads one pipe-delimited column of an output row.
 *
 * @param row an output row
 * @param index the column index
 * @returns the cell text
 */
export function cell(row: string, index: number): string {
  return row.split('|')[index];
}

/**
 * Picks the brewer of the first row whose club differs from `club`, and the rows
 * a brewer-or-club filter must therefore return.
 *
 * @param unfiltered the unfiltered parse
 * @param brewerIndex the brewer column index
 * @param club the club name as published
 * @returns the outside brewer and the expected rows
 */
export function brewerOrClubExpectation(unfiltered: ParsedResults | undefined, brewerIndex: number, club: string): { brewer: string; expected: string[] } {
  const rows = rowsOf(unfiltered);
  const outside = rows.find(row => !row.endsWith(`|${club}`));
  expect(outside, 'fixture has a row outside the club').to.not.equal(undefined);
  const brewer = cell(outside as string, brewerIndex);
  const expected = rows.filter(row => cell(row, brewerIndex) === brewer || row.endsWith(`|${club}`));
  expect(expected.length, 'both filters contribute').to.be.greaterThan(rows.filter(row => row.endsWith(`|${club}`)).length);

  return { brewer, expected };
}
