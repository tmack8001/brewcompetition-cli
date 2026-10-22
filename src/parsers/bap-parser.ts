import type { CheerioAPI } from 'cheerio';
import type { Element } from 'domhandler';

import * as cheerio from 'cheerio';

import { HttpStatusError, fetchJson } from '../http/fetch.js';
import { shouldIncludeEntry } from './filters.js';
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

  async parseResults(html: string, filters: { brewers: string | undefined, club: string | undefined }, url?: string): Promise<ParsedResults | undefined> {
    const header: string[] = ['Table / Category', 'Place', 'Entry Count', 'Entry Name', 'Style', 'Brewer', 'Club'];
    let data: string[][] = [];
    let apiRead = false;
    let apiError: unknown;

    // Try to fetch from API first if we have a URL
    if (url) {
      const competitionKey = this.extractCompetitionKey(url);
      if (!competitionKey) {
        // The live page is an app shell; the HTML fallback cannot help here
        throw new Error(`Could not extract a BAP competition key from URL: ${url}`);
      }

      try {
        data = await this.parseApiData(competitionKey, filters);
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
        data = this.parseHtmlData(html, filters);
      } catch (error) {
        // With a URL the API may legitimately have matched nothing, so only a saved page fails hard.
        if (!(error instanceof BapHtmlStructureError) || !url) throw error;
      }
    }

    if (data.length === 0) {
      // The live page is an app shell, so an API failure cannot be recovered from HTML
      if (apiError) throw apiError;

      if (apiRead) {
        console.error(filters.brewers || filters.club
          ? 'Competition read, but no medals matched the given filters'
          : 'Competition read, but it has no published medals');
      } else {
        console.error('No results found in BAP format');
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

  private isStandaloneNotice(row: Element, lines: string[], $: CheerioAPI): boolean {
    return lines.length === 1
      && collapse($(row).text()) === lines[0]
      && (NO_AWARD.test(lines[0]) || lines[0].includes(CUSTOM_AWARD_SEPARATOR));
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

  private async parseApiData(competitionKey: string, filters: { brewers: string | undefined, club: string | undefined }): Promise<string[][]> {
    const data: string[][] = [];

    // First, get the competition info to extract the competitionId
    const competitionId = await this.loadCompetitionId(competitionKey);

    // Now fetch the results
    const resultsResponse = await this.fetcher<{ results?: { miniBos?: Record<string, BapCategory> } }>(
      `https://beerawardsplatform.com/api/getResults?competitionId=${encodeURIComponent(competitionId)}`
    );

    const results = resultsResponse?.results?.miniBos;
    if (!results) {
      return data;
    }

    // Parse the results
    for (const categoryId in results) {
      if (!Object.hasOwn(results, categoryId)) continue;

      const category = results[categoryId];
      const categoryNameRaw = (category.name || 'Unknown Category').trim();

      // Skip Best of Show for now
      if (categoryNameRaw.includes('Best of Show')) {
        continue;
      }

      const { categoryName, entryCount } = this.extractCategoryAndEntryCount(categoryNameRaw);

      const positions = category.positions || {};

      // Iterate through positions (1, 2, 3, 4)
      for (const position in positions) {
        if (!Object.hasOwn(positions, position)) continue;

        const entries = positions[position];
        if (!Array.isArray(entries)) continue;

        for (const entry of entries) {
          const brewer = (entry.participant?.name || entry.participant?.displayName || '').trim();
          const club = (entry.participant?.club || '').trim();
          const entryName = (entry.name || '').trim();
          const style = (entry.styleSubcategory || '').trim();

          // Convert position to standard format: 1st, 2nd, 3rd, HM
          const place = this.convertMedalPlacement(position);
          const shouldInclude = shouldIncludeEntry(brewer, club, filters);

          if (shouldInclude) {
            data.push(this.createResultRow({
              brewer,
              categoryName,
              club,
              entryCount,
              entryName,
              place,
              style
            }));
          }
        }
      }
    }

    return data;
  }

  private parseHtmlData(html: string, filters: { brewers: string | undefined, club: string | undefined }): string[][] {
    const $ = cheerio.load(html);
    const data: string[][] = [];

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

      if (heading.text.includes('Best of Show')) continue;

      const lines = $(row).find('h1,h2,h3,h4,h5,h6,p').toArray()
        .map(element => collapse($(element).text()))
        .filter(Boolean);

      if (this.isStandaloneNotice(row, lines, $)) continue;

      const { brewer, club, style } = this.readAwardLines(lines, heading.text);

      const { categoryName, entryCount } = this.extractCategoryAndEntryCount(
        heading.text.replace(ENTRIES_SUFFIX, ' ($1)')
      );

      if (shouldIncludeEntry(brewer, club, filters)) {
        data.push(this.createResultRow({
          brewer,
          categoryName,
          club,
          entryCount,
          entryName: lines[0],
          place: this.convertMedalPlacement(medal.attribs.title),
          style
        }));
      }
    }

    return data;
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
