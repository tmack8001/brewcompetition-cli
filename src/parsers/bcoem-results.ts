import type { Element } from 'domhandler';

import * as cheerio from 'cheerio';

import { shouldIncludeEntry } from './filters.js';
import { ParsedResults } from './types.js';

export class BcoemHtmlStructureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BcoemHtmlStructureError';
  }
}

type Filters = { brewers: string | undefined; club: string | undefined };

interface Columns {
  brewer: number;
  club: number;
  labels: string[];
}

const HEADING = 'h1,h2,h3,h4,h5,h6,[role="heading"]';
const ENTRY_COUNT_SUFFIX = /\((\d+)\s+entries\)$/;
const CO_BREWER_LABEL = 'Co-Brewer:';

const collapse = (text: string): string => text.replaceAll(/\s+/g, ' ').trim();

/**
 * Reads the Place / Brewer / Entry Name / Style / Club table out of a BCOEM
 * results page.
 *
 * A medal table is recognised by what its header says, not by how the page
 * styles it: the first column is Place, and Brewer, a name column, Style and
 * Club are all present. The standings tables (best brewer, best club) have
 * ordinal or score columns instead of an entry and are left out. Each table is
 * named by the closest heading in front of it that follows the previous table.
 * Every medal table must have the same columns as the first, since the output
 * has one header.
 *
 * @param html the saved results page
 * @param filters the --brewers / --club values
 * @returns the pipe-delimited header and rows
 * @throws BcoemHtmlStructureError when no medal table is found or one cannot be read
 */
export function parseBcoemResults(html: string, filters: Filters): ParsedResults {
  const $ = cheerio.load(html);
  const header: string[] = [];
  const data: string[][] = [];
  const medalTables: Element[] = [];
  let firstLabels: string[] = [];
  let heading: string | undefined;

  const text = (node: Element): string => $(node).text().trim();

  for (const node of $(`${HEADING},table`).toArray()) {
    if (node.name !== 'table') {
      if (!$(node).parents('table').toArray().some(table => medalTables.includes(table))) heading = text(node);
      continue;
    }

    const rows = $(node).find('tr').toArray().filter(row => $(row).closest('table')[0] === node);
    const columns = rows
      .map(row => readColumns($(row).children('th').toArray().map(cell => text(cell))))
      .find(Boolean);
    const tableHeading = heading;
    heading = undefined;
    if (!columns) continue;

    medalTables.push(node);
    if (tableHeading === undefined || tableHeading === '') {
      throw new BcoemHtmlStructureError(`BCOEM results table (${columns.labels.join(', ')}) has no heading before it`);
    }

    const { entryCount, tableName } = splitEntryCount(tableHeading);
    if (header.length === 0) {
      header.push('Table / Category', 'Place', 'Entry Count', ...columns.labels.slice(1));
      firstLabels = columns.labels.map(name => name.toLowerCase());
    } else if (columns.labels.map(name => name.toLowerCase()).join('|') !== firstLabels.join('|')) {
      throw new BcoemHtmlStructureError(`BCOEM results table "${tableName}" has columns (${columns.labels.join(', ')}) unlike the first table's (${firstLabels.join(', ')})`);
    }

    for (const row of rows.filter(candidate => $(candidate).children('td').length > 0)) {
      const cells = $(row).children('td').toArray().map(cell => text(cell));
      if (cells.length !== columns.labels.length || cells[0] === '') {
        throw new BcoemHtmlStructureError(`BCOEM row under "${tableName}" does not match its header (${columns.labels.join(', ')}): ${JSON.stringify(cells)}`);
      }

      const brewer = removeMhpBadge(cells[columns.brewer].split(CO_BREWER_LABEL)[0].trim());
      if (shouldIncludeEntry(brewer, cells[columns.club], filters)) {
        const [place, ...rest] = cells.map(cell => sanitizeForCsv(removeMhpBadge(cell)));
        data.push([tableName, place, entryCount, ...rest]);
      }
    }
  }

  if (medalTables.length === 0) {
    throw new BcoemHtmlStructureError('No BCOEM medal table found: expected a table headed Place, Brewer, Entry Name, Style and Club. Results may not be published yet, or the page layout is not recognised');
  }

  return {
    data: data.map(row => row.join('|')).join('\n'),
    header: header.join('|'),
  };
}

/**
 * Maps a header row to column positions.
 *
 * @param labels the header cell texts
 * @returns the brewer and club positions, or undefined when this is not a medal table
 */
function readColumns(labels: string[]): Columns | undefined {
  const display = labels.map(text => collapse(text));
  const names = display.map(text => text.toLowerCase());
  const brewer = names.indexOf('brewer');
  const club = names.indexOf('club');
  const hasEntry = names.includes('entry name') || names.includes('name');

  if (names[0] !== 'place' || brewer === -1 || club === -1 || !hasEntry || !names.includes('style')) return undefined;

  return { brewer, club, labels: display };
}

function splitEntryCount(heading: string): { entryCount: string; tableName: string } {
  const match = heading.match(ENTRY_COUNT_SUFFIX);

  return { entryCount: match ? match[1] : '', tableName: heading.replace(ENTRY_COUNT_SUFFIX, '').trim() };
}

function removeMhpBadge(text: string): string {
  return text.replaceAll(' MHP', '');
}

function sanitizeForCsv(text: string): string {
  return text.replaceAll(',', '');
}
