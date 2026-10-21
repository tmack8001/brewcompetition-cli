import cheerio from 'cheerio';

import { HttpStatusError, fetchJson } from '../http/fetch.js';
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
      data = this.parseHtmlData(html, filters);
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

  private extractCategoryAndEntryCount(categoryNameRaw: string): { categoryName: string, entryCount: string } {
    // Extract entry count from category name (format: "Category Name (14)")
    const entryCountMatch = categoryNameRaw.match(/\((\d+)\)$/);
    const entryCount = entryCountMatch ? entryCountMatch[1].trim() : '';
    const categoryName = categoryNameRaw.replace(/\s*\(\d+\)$/, '').trim();

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
          const shouldInclude = this.shouldIncludeEntry(brewer, club, filters);

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

    // BAP uses MUI cards with specific class structure (for saved HTML pages)
    $('.MuiCard-root').each((_index, card) => {
      // Get category name from card header
      const categoryNameRaw = $(card).find('.MuiCardHeader-title').text().trim();

      if (!categoryNameRaw || categoryNameRaw.includes('Best of Show')) {
        return; // Skip BOS for now or handle separately
      }

      const { categoryName, entryCount } = this.extractCategoryAndEntryCount(categoryNameRaw);

      // Each award is in a div with class jss95
      $(card).find('.jss95').each((_awardIndex, awardDiv) => {
        // Get place from the title attribute of the medal icon container
        const placeDiv = $(awardDiv).find('.jss99');
        const placeRaw = placeDiv.attr('title') || '';

        // Convert place to standard format: 1st, 2nd, 3rd, HM
        const place = this.convertMedalPlacement(placeRaw);

        // Check if this is a "No award" entry
        const noAward = $(awardDiv).find('em').text();
        if (noAward.includes('No award')) {
          return;
        }

        // Get entry details from jss96 div
        const detailsDiv = $(awardDiv).find('.jss96');
        const paragraphs = detailsDiv.find('p');

        if (paragraphs.length < 2) return;

        const entryName = $(paragraphs[0]).text().trim();
        const style = $(paragraphs[1]).text().trim();

        // Brewer and club info - can be in multiple paragraphs
        let brewer = '';
        let club = '';

        for (let i = 2; i < paragraphs.length; i++) {
          const text = $(paragraphs[i]).text().trim();
          if (text.startsWith('Club:')) {
            club = text.replace('Club:', '').trim();
          } else if (text.startsWith('Collaboration with')) {
            // Skip collaboration line for now
            continue;
          } else if (!brewer) {
            // Extract just the brewer name (before the comma and location)
            brewer = text.split(',')[0].trim();
          }
        }

        const shouldInclude = this.shouldIncludeEntry(brewer, club, filters);

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
      });
    });

    return data;
  }

  private sanitizeForCsv(text: string): string {
    return text.replaceAll(',', '');
  }

  private shouldIncludeEntry(brewer: string, club: string, filters: { brewers: string | undefined, club: string | undefined }): boolean {
    // If no filters, include everything
    if (!filters.brewers && !filters.club) {
      return true;
    }

    // If brewer filter is set, check if this brewer matches
    if (filters.brewers) {
      const brewerList = filters.brewers.split(',').map(b => b.trim());
      if (brewerList.includes(brewer)) {
        return true;
      }
    }

    // If club filter is set, check if this club matches
    if (filters.club && club === filters.club) {
      return true;
    }

    return false;
  }
}
