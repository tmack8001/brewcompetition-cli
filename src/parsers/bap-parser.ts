import type { CheerioAPI } from 'cheerio';
import type { Element } from 'domhandler';

import * as cheerio from 'cheerio';

import { HttpStatusError, fetchJson } from '../http/fetch.js';
import { type ResultFilters, normalizeForMatch, shouldIncludeEntry, wantedBrewers } from './filters.js';
import { isBapHost } from './platform-detector.js';
import { CompetitionParser, ParsedMetadata, ParsedResults, UnsupportedOperationError } from './types.js';

interface BapEntry {
  name?: string;
  participant?: { club?: string; displayName?: string; name?: string };
  styleSubcategory?: string;
}

interface BapCategory {
  name?: string;
  positions?: Record<string, BapEntry[]>;
}

interface BapCustomAward {
  name?: string;
  positions?: unknown;
}

interface BapResults {
  bos?: { positions?: Record<string, BapEntry[]> };
  custom?: { awards?: BapCustomAward[] };
  miniBos?: Record<string, BapCategory>;
}

/** A custom award line that could not be read, kept so the caller can report it once. */
interface SkippedAward {
  award: string;
  /** The line names a club or brewer the filters ask for, so a requested medal is missing from the output. */
  mentionsFilter: boolean;
  text: string;
}

/** What one read of the API or of a saved page found. */
interface Collected {
  /** Rows in output order; `award` marks rows that come from the overall Best of Show or a custom award. */
  items: { award: boolean; row: string[] }[];
  skipped: SkippedAward[];
}

/** The category BAP's own page uses for the overall Best of Show card. */
const BEST_OF_SHOW = 'Best of Show';

/** The API reports no competition for the key in the URL. */
export class BapCompetitionNotFoundError extends Error {
  constructor(competitionKey: string) {
    super(`No BAP competition found for key "${competitionKey}"; check that the URL is a competition page`);
    this.name = 'BapCompetitionNotFoundError';
  }
}

const PLACE_TITLE = /^#[1-9]\d*$/;
const STYLE_PREFIX = /^[\dA-Z]{1,6}\s+-\s+(?=\S)/;
const CUSTOM_AWARD_SEPARATOR = String.raw` \ `;
const NO_AWARD = /^no award/i;
/** The wording older competitions used for a custom award: `Brewer / Club: X - Entry (style)`. */
const OLD_CUSTOM_AWARD = ' / Club:';
const ENTRIES_SUFFIX = /\s+(\d+)\s+entr(?:y|ies)\s*$/i;

const collapse = (text: string): string => text.replaceAll(/\s+/g, ' ').trim();

export class BapHtmlStructureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BapHtmlStructureError';
  }
}

const BAP_ENTRY_COUNT_SUFFIX = /\s*(?:\((\d+)\)|(?<!\S)(\d+)\s+entr(?:y|ies))\s*$/i;

export class BAPParser implements CompetitionParser {
  constructor(private readonly fetcher: typeof fetchJson = fetchJson) {}

  async parseMetadata(_html: string): Promise<ParsedMetadata> {
    // BAP metadata parsing - to be implemented based on BAP's structure
    throw new UnsupportedOperationError('BAP metadata parsing not yet implemented');
  }

  async parseResults(html: string, filters: ResultFilters, url?: string): Promise<ParsedResults | undefined> {
    const header: string[] = ['Table / Category', 'Place', 'Entry Count', 'Entry Name', 'Style', 'Brewer', 'Club'];
    let data: string[][] = [];
    let apiRead = false;
    let apiError: unknown;
    const skipped = new Map<string, SkippedAward>();
    const noteSkipped = (found: SkippedAward[]): void => {
      for (const line of found) skipped.set(JSON.stringify([line.award, line.text]), line);
    };

    // Try to fetch from API first if we have a URL
    if (url) {
      const competitionKey = this.extractCompetitionKey(url);
      if (!competitionKey) {
        // The live page is an app shell; the HTML fallback cannot help here
        throw new Error(`Could not extract a BAP competition key from URL: ${url}`);
      }

      try {
        const collected = await this.parseApiData(competitionKey, filters);
        data = this.dropRepeatedBestOfShow(collected.items);
        noteSkipped(collected.skipped);
        apiRead = true;
      } catch (error) {
        // Not-found is final; other failures fall back to HTML
        if (error instanceof BapCompetitionNotFoundError) throw error;
        apiError = error;
        console.error('Error fetching BAP API data:', error);
      }
    }

    // Fall back to HTML parsing if API didn't work
    if (data.length === 0) {
      try {
        const collected = this.parseHtmlData(html, filters);
        data = this.dropRepeatedBestOfShow(collected.items);
        noteSkipped(collected.skipped);
      } catch (error) {
        // With a URL the API may legitimately have matched nothing, so only a saved page fails hard.
        if (!(error instanceof BapHtmlStructureError) || !url) throw error;
      }
    }

    // The saved page lists the same awards as the API, so each distinct line is reported once
    for (const line of skipped.values()) {
      console.error(line.mentionsFilter
        ? `WARNING: BAP custom award "${line.award}" has a line in an unrecognized format that mentions the requested club or brewer; its medal could NOT be read and is missing from this output: ${JSON.stringify(line.text)} (expected "entry \\ style \\ brewer \\ Club: club")`
        : `Skipping BAP custom award "${line.award}": unrecognized format ${JSON.stringify(line.text)} (expected "entry \\ style \\ brewer \\ Club: club")`);
    }

    if (data.length === 0) {
      // The live page is an app shell, so an API failure cannot be recovered from HTML
      if (apiError) throw apiError;

      const note = skipped.size > 0
        ? ` (${skipped.size} custom award line${skipped.size === 1 ? ' was' : 's were'} skipped for an unrecognized format; see above)`
        : '';

      if (apiRead) {
        console.error((filters.brewers || filters.club
          ? 'Competition read, but no medals matched the given filters'
          : 'Competition read, but it has no published medals') + note);
      } else {
        console.error('No results found in BAP format' + note);
      }

      return undefined;
    }

    const headerCsv = header.join('|');
    const dataCsv = data.map(row => row.join('|')).join('\n');

    return {
      data: dataCsv,
      header: headerCsv,
    };
  }

  /**
   * Adds the row for one custom award line, or records why the line is not used.
   *
   * @param into where the row or the unreadable line goes
   * @param line the award name, the line BAP shows for the place, and the place (already converted)
   * @param line.categoryName the award name
   * @param line.place the place
   * @param line.text the line BAP shows
   * @param filters the brewer/club filters
   */
  private collectCustomAward(into: Collected, line: { categoryName: string; place: string; text: string }, filters: ResultFilters): void {
    const { categoryName, place, text } = line;
    const award = this.parseCustomAward(text);
    if (!award) {
      // Older competitions used another wording; their other medals are still good, so report the line and carry on
      into.skipped.push({ award: categoryName, mentionsFilter: this.mentionsFilter(text, filters), text });
      return;
    }

    if (shouldIncludeEntry(award.brewer, award.club, filters)) {
      into.items.push({ award: true, row: this.createResultRow({ ...award, categoryName, entryCount: '', place }) });
    }
  }

  /**
   * Adds the rows of the custom awards (e.g. "Best of Show - Mead & Cider"): one display string per place.
   *
   * @param into where the rows and the unreadable lines go
   * @param awards results.custom.awards
   * @param filters the brewer/club filters
   */
  private collectCustomAwards(into: Collected, awards: unknown, filters: ResultFilters): void {
    for (const award of Array.isArray(awards) ? (awards as (BapCustomAward | null)[]) : []) {
      const categoryName = (typeof award?.name === 'string' && award.name.trim()) || 'Unknown Award';
      const positions = Array.isArray(award?.positions) ? award.positions : [];

      for (const [index, text] of positions.entries()) {
        // A blank or "No award" position still uses up its place number
        if (typeof text !== 'string' || !text.trim() || NO_AWARD.test(text.trim())) continue;

        this.collectCustomAward(into, { categoryName, place: this.convertMedalPlacement(String(index + 1)), text }, filters);
      }
    }
  }

  private collectPositions(
    into: Collected,
    positions: Record<string, BapEntry[]> | undefined,
    category: { award: boolean; categoryName: string; entryCount: string },
    filters: ResultFilters
  ): void {
    const byPlace = positions || {};

    // Iterate through positions (1, 2, 3, 4)
    for (const position in byPlace) {
      if (!Object.hasOwn(byPlace, position)) continue;

      const entries = byPlace[position];
      if (!Array.isArray(entries)) continue;

      for (const entry of entries) {
        if (!entry || typeof entry !== 'object') continue;

        const brewer = (entry.participant?.name || entry.participant?.displayName || '').trim();
        const club = (entry.participant?.club || '').trim();
        const entryName = (entry.name || '').trim();
        const style = (entry.styleSubcategory || '').trim();

        // Convert position to standard format: 1st, 2nd, 3rd, HM
        const place = this.convertMedalPlacement(position);

        if (shouldIncludeEntry(brewer, club, filters)) {
          into.items.push({
            award: category.award,
            row: this.createResultRow({ brewer, categoryName: category.categoryName, club, entryCount: category.entryCount, entryName, place, style })
          });
        }
      }
    }
  }

  private convertMedalPlacement(position: string): string {
    // Handle both numeric (1, 2, 3, 4) and hash formats (#1, #2, #3, #4)
    const normalized = position.replace('#', '');

    switch (normalized) {
      case '1': {
        return '1st';
      }

      case '2': {
        return '2nd';
      }

      case '3': {
        return '3rd';
      }

      case '4': {
        return 'HM';
      }

      default: {
        return position; // Return original if not a standard placement
      }
    }
  }

  private createResultRow(entry: {
    brewer: string;
    categoryName: string;
    club: string;
    entryCount: string;
    entryName: string;
    place: string;
    style: string;
  }): string[] {
    return [
      this.sanitizeForCsv(entry.categoryName),
      this.sanitizeForCsv(entry.place),
      entry.entryCount,
      this.sanitizeForCsv(entry.entryName),
      this.sanitizeForCsv(entry.style),
      this.sanitizeForCsv(entry.brewer),
      this.sanitizeForCsv(entry.club)
    ];
  }

  private describeMissingRows($: CheerioAPI): string {
    $('script,style,noscript').remove();
    const visibleText = collapse($('body').text());

    return visibleText.length < 200
      ? 'BAP HTML has no award rows and almost no visible text: it looks like the unrendered app shell. Save the rendered DOM instead (for example headless Chrome with --dump-dom --virtual-time-budget=20000).'
      : 'BAP HTML has no award rows (no medal marker titled "#1", "#2", ...); the page structure is not recognized.';
  }

  /**
   * Flattens the rows, leaving out an overall-Best-of-Show or custom-award row that repeats a row of a table
   * whose name starts with "Best of Show" (BAP can list the same medal both ways). Ties and other rows are kept.
   *
   * @param items the rows in output order
   * @returns the rows
   */
  private dropRepeatedBestOfShow(items: Collected['items']): string[][] {
    const key = (row: string[]): string => JSON.stringify([row[0], row[1], row[3], row[4], row[5], row[6]].map(cell => normalizeForMatch(cell)));
    const tables = new Set(items.filter(item => !item.award && item.row[0].startsWith(BEST_OF_SHOW)).map(item => key(item.row)));

    return items.filter(item => !item.award || !tables.has(key(item.row))).map(item => item.row);
  }

  private extractCategoryAndEntryCount(categoryNameRaw: string): { categoryName: string, entryCount: string } {
    // "Name (14)", "Name 14 Entries" or "Name 1 Entry"
    const match = categoryNameRaw.match(BAP_ENTRY_COUNT_SUFFIX);
    const entryCount = match ? (match[1] ?? match[2]) : '';
    const categoryName = categoryNameRaw.replace(BAP_ENTRY_COUNT_SUFFIX, '').trim();

    return { categoryName, entryCount };
  }

  private extractCompetitionKey(url: string): null | string {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }

    if (!isBapHost(parsed.hostname)) {
      return null;
    }

    const segment = parsed.pathname.split('/').find(Boolean);
    if (!segment) return null;

    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  }

  private findHeading(
    $: CheerioAPI,
    row: Element,
    hasMedal: (element: Element) => boolean
  ): { element: Element; text: string } | undefined {
    let node: Element | null = row;
    while (node) {
      for (const sibling of $(node).prevAll().toArray()) {
        if (hasMedal(sibling)) continue;
        const text = collapse(
          $(sibling).find('*').addBack().not('script,style,noscript').contents().toArray()
            .map(child => (child.type === 'text' ? child.data : ''))
            .join(' ')
        );
        if (!text) continue;
        if ($(sibling).find('p,h1,h2,h3,h4,h5,h6').toArray().some(line => this.looksLikeAwardLine($(line).text()))) {
          throw new BapHtmlStructureError(`BAP award row without a #N medal title: ${JSON.stringify(text)}`);
        }

        return { element: sibling, text };
      }

      node = node.parent as Element | null;
    }

    return undefined;
  }

  /** A row whose whole text is a single line (a "No award" notice or a custom award string). */
  private isSingleLine(row: Element, lines: string[], $: CheerioAPI): boolean {
    return lines.length === 1 && collapse($(row).text()) === lines[0];
  }

  private async loadCompetitionId(competitionKey: string): Promise<string> {
    let info: { competition?: { competitionId?: string } } | undefined;
    try {
      info = await this.fetcher<{ competition?: { competitionId?: string } }>(
        `https://beerawardsplatform.com/api/loadCompetitionInfo?competitionKey=${encodeURIComponent(competitionKey)}&includeEntryCount`
      );
    } catch (error) {
      if (error instanceof HttpStatusError && error.status === 404) {
        throw new BapCompetitionNotFoundError(competitionKey);
      }

      throw error;
    }

    const competitionId = info?.competition?.competitionId;
    if (!competitionId) {
      throw new BapCompetitionNotFoundError(competitionKey);
    }

    return competitionId;
  }

  private looksLikeAwardLine(text: string): boolean {
    const line = collapse(text);
    return line.startsWith('Club:') || NO_AWARD.test(line) || STYLE_PREFIX.test(line);
  }

  /** Whether text names a requested club or brewer, as whole words, compared like the filters compare names. */
  private mentionsFilter(text: string, filters: ResultFilters): boolean {
    const haystack = normalizeForMatch(text);
    const wanted = [normalizeForMatch(filters.club ?? ''), ...wantedBrewers(filters.brewers ?? '')].filter(Boolean);

    return wanted.some(name => new RegExp(String.raw`(?<![\p{L}\p{N}])${name.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`)}(?![\p{L}\p{N}])`, 'u').test(haystack));
  }

  private async parseApiData(competitionKey: string, filters: ResultFilters): Promise<Collected> {
    const into: Collected = { items: [], skipped: [] };

    // First, get the competition info to extract the competitionId
    const competitionId = await this.loadCompetitionId(competitionKey);

    // Now fetch the results
    const resultsResponse = await this.fetcher<{ results?: BapResults }>(
      `https://beerawardsplatform.com/api/getResults?competitionId=${encodeURIComponent(competitionId)}`
    );

    const results = resultsResponse?.results;
    if (!results) {
      return into;
    }

    // Category mini-BOS tables
    const miniBos = results.miniBos ?? {};
    for (const categoryId in miniBos) {
      if (!Object.hasOwn(miniBos, categoryId)) continue;

      const category = miniBos[categoryId];
      if (!category || typeof category !== 'object') continue;

      const { categoryName, entryCount } = this.extractCategoryAndEntryCount((category.name || 'Unknown Category').trim());

      this.collectPositions(into, category.positions, { award: false, categoryName, entryCount }, filters);
    }

    // The overall Best of Show, which BAP's own page shows as a "Best of Show" card
    this.collectPositions(into, results.bos?.positions, { award: true, categoryName: BEST_OF_SHOW, entryCount: '' }, filters);

    this.collectCustomAwards(into, results.custom?.awards, filters);

    return into;
  }

  /**
   * Reads a custom award line, `entry \ M2A - Style \ Brewer, City, ST, USA \ Club: X`. The club part is absent for a
   * brewer without a club, and `Collaboration with ...` parts may follow the brewer (they are ignored).
   *
   * @param text the line BAP shows for the award position
   * @returns the fields, or undefined when the line is not in that format
   */
  private parseCustomAward(text: string): undefined | { brewer: string; club: string; entryName: string; style: string } {
    const parts = text.split(CUSTOM_AWARD_SEPARATOR).map(part => collapse(part));
    if (parts.length < 3 || parts.slice(0, 3).some(part => !part)) return undefined;

    const [entryName, styleLine, brewerLine, ...rest] = parts;
    const brewer = brewerLine.split(',')[0].trim();
    if (!brewer || !STYLE_PREFIX.test(styleLine)) return undefined;

    const clubs = rest.filter(part => part.startsWith('Club:'));
    if (clubs.length > 1 || rest.some(part => !part.startsWith('Club:') && !part.startsWith('Collaboration with'))) return undefined;

    return {
      brewer,
      club: clubs.length === 0 ? '' : clubs[0].slice('Club:'.length).trim(),
      entryName,
      style: styleLine.replace(STYLE_PREFIX, '')
    };
  }

  private parseHtmlData(html: string, filters: ResultFilters): Collected {
    const $ = cheerio.load(html);
    const into: Collected = { items: [], skipped: [] };

    const isMedal = (element: Element): boolean => PLACE_TITLE.test(element.attribs?.title ?? '');
    const medals = $('[title]').toArray().filter(element => isMedal(element));

    if (medals.length === 0) {
      throw new BapHtmlStructureError(this.describeMissingRows($));
    }

    const hasMedal = (element: Element): boolean => isMedal(element) || $(element).find('[title]').toArray().some(child => isMedal(child));
    const lastPlaceByHeading = new Map<Element, number>();

    for (const medal of medals) {
      const row = medal.parent as Element | null;
      if (!row) throw new BapHtmlStructureError('BAP medal marker has no enclosing award row');

      const heading = this.findHeading($, row, hasMedal);
      if (!heading) throw new BapHtmlStructureError('BAP award row has no category heading before it');

      const placeNumber = Number(medal.attribs.title.slice(1));
      const previous = lastPlaceByHeading.get(heading.element) ?? 0;
      if (placeNumber < previous) {
        throw new BapHtmlStructureError(`BAP places under "${heading.text}" are out of order (#${placeNumber} after #${previous})`);
      }

      lastPlaceByHeading.set(heading.element, placeNumber);

      const lines = $(row).find('h1,h2,h3,h4,h5,h6,p').toArray()
        .map(element => collapse($(element).text()))
        .filter(Boolean);

      if (this.isSingleLine(row, lines, $)) {
        if (NO_AWARD.test(lines[0])) continue;

        // A custom award is one line of text, in the current or the old wording; any other single line is a
        // damaged award row and falls through to the error below.
        if (lines[0].includes(CUSTOM_AWARD_SEPARATOR) || lines[0].includes(OLD_CUSTOM_AWARD)) {
          const { categoryName } = this.extractCategoryAndEntryCount(heading.text.replace(ENTRIES_SUFFIX, ' ($1)'));
          this.collectCustomAward(into, { categoryName, place: this.convertMedalPlacement(medal.attribs.title), text: lines[0] }, filters);
          continue;
        }
      }

      const { brewer, club, style } = this.readAwardLines(lines, heading.text);

      const counted = this.extractCategoryAndEntryCount(heading.text.replace(ENTRIES_SUFFIX, ' ($1)'));
      // A count on the overall Best of Show card means nothing; the API path leaves it blank
      const { categoryName } = counted;
      const isCard = categoryName === BEST_OF_SHOW;
      const entryCount = isCard ? '' : counted.entryCount;

      if (shouldIncludeEntry(brewer, club, filters)) {
        into.items.push({
          award: isCard,
          row: this.createResultRow({
            brewer,
            categoryName,
            club,
            entryCount,
            entryName: lines[0],
            place: this.convertMedalPlacement(medal.attribs.title),
            style
          })
        });
      }
    }

    return into;
  }

  private readAwardLines(lines: string[], headingText: string): { brewer: string; club: string; style: string } {
    const styleIndex = lines.findIndex((line, index) => index > 0 && STYLE_PREFIX.test(line));
    if (styleIndex === -1) {
      throw new BapHtmlStructureError(`BAP award row under "${headingText}" has no style line like "6B - Rauchbier": ${JSON.stringify(lines)}`);
    }

    let brewer = '';
    let club = '';
    for (const line of lines.slice(styleIndex + 1)) {
      if (line.startsWith('Club:')) {
        club = line.slice('Club:'.length).trim();
      } else if (!line.startsWith('Collaboration with') && !brewer) {
        brewer = line.split(',')[0].trim();
      }
    }

    return { brewer, club, style: lines[styleIndex].replace(STYLE_PREFIX, '') };
  }

  private sanitizeForCsv(text: string): string {
    return text.replaceAll(',', '');
  }
}
