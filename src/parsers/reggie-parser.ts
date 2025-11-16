import cheerio from 'cheerio';

import { CompetitionParser, ParsedMetadata, ParsedResults } from './types.js';

export class ReggieParser implements CompetitionParser {
  async parseMetadata(_html: string): Promise<ParsedMetadata> {
    // Reggie metadata parsing - to be implemented based on Reggie's structure
    throw new Error('Reggie metadata parsing not yet implemented');
  }

  async parseResults(html: string, filters: { brewers: string | undefined, club: string | undefined }): Promise<ParsedResults | undefined> {
    const header: string[] = ['Table / Category', 'Medal', 'Entry Count', 'Brewer', 'Style', 'Brew Name', 'Club'];
    let data: string[][] = [];

    // Try to parse JavaScript data first (live Reggie pages)
    const jsDataMatch = html.match(/var aaReggieMedals=\[([\S\s]*?)];/);
    const jsGroupsMatch = html.match(/var saReggieGroups=\[([\S\s]*?)];/);

    if (jsDataMatch && jsGroupsMatch) {
      data = this.parseJavaScriptData(jsDataMatch[1], jsGroupsMatch[1], filters);
    }

    // Fall back to HTML parsing (for saved/rendered pages)
    if (data.length === 0) {
      data = this.parseHtmlData(html, filters);
    }

    if (data.length === 0) {
      console.error('No results found in Reggie format');
      return undefined;
    }

    const headerCsv = header.join('|');
    const dataCsv = data.map(row => row.join('|')).join('\n');

    return {
      data: dataCsv,
      header: headerCsv,
    };
  }

  private convertMedalPlacement(place: string): string {
    switch (place) {
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
        return `${place}th`;
      }
    }
  }

  private createResultRow(entry: {
    beerName: string;
    brewer: string;
    category: string;
    club: string;
    entryCount: string;
    medalText: string;
    style: string;
  }): string[] {
    return [
      this.sanitizeForCsv(entry.category),
      this.sanitizeForCsv(entry.medalText),
      entry.entryCount,
      this.sanitizeForCsv(entry.brewer),
      this.sanitizeForCsv(entry.style),
      this.sanitizeForCsv(entry.beerName),
      this.sanitizeForCsv(entry.club)
    ];
  }

  private extractCategoryAndEntryCount(categoryRaw: string): { category: string, entryCount: string } {
    // Extract entry count from category (format: "Category Name (14 entries)")
    const entryCountMatch = categoryRaw.match(/\((\d+)\s+entries\)$/);
    const entryCount = entryCountMatch ? entryCountMatch[1].trim() : '';
    const category = categoryRaw.replace(/\s*\(\d+\s+entries\)$/, '').trim();

    return { category, entryCount };
  }

  private extractClubName(clubWithLocation: string): string {
    // Remove location in parentheses: "Club Name (City, State)" -> "Club Name"
    return clubWithLocation.replace(/\s*\([^)]+\)\s*$/, '').trim();
  }

  private parseHtmlData(html: string, filters: { brewers: string | undefined, club: string | undefined }): string[][] {
    const $ = cheerio.load(html);
    const data: string[][] = [];
    let currentCategory = '';
    let currentEntryCount = '';

    // Reggie renders results in tbody with GroupHeader rows followed by data rows
    $('tbody tr').each((_index, row) => {
      const $row = $(row);

      // Check if this is a category header row
      const groupHeader = $row.find('td.GroupHeader');
      if (groupHeader.length > 0) {
        const categoryRaw = groupHeader.text().trim();
        const extracted = this.extractCategoryAndEntryCount(categoryRaw);
        currentCategory = extracted.category;
        currentEntryCount = extracted.entryCount;
        return;
      }

      // Skip header rows (th elements)
      if ($row.find('th').length > 0) {
        return;
      }

      const cells = $row.find('td');
      if (cells.length < 5) return;

      // Reggie structure: Brewer Name | Medal | Style | Brew Name | Club
      const brewerCell = $(cells[0]);
      // Extract just the brewer name (remove MHP badge which is in a span)
      const brewerSpan = brewerCell.find('span').first();
      const brewer = brewerSpan.length > 0 ? brewerSpan.text().trim() : brewerCell.text().trim();
      const medal = $(cells[1]).text().trim();
      const style = $(cells[2]).text().trim();
      const brewName = $(cells[3]).text().trim();
      const clubRaw = $(cells[4]).text().trim();
      const club = this.extractClubName(clubRaw);

      const shouldInclude = this.shouldIncludeEntry(brewer, club, filters);

      if (shouldInclude) {
        data.push(this.createResultRow({
          beerName: brewName,
          brewer,
          category: currentCategory,
          club,
          entryCount: currentEntryCount,
          medalText: medal,
          style
        }));
      }
    });

    return data;
  }

  private parseJavaScriptData(medalsData: string, groupsData: string, filters: { brewers: string | undefined, club: string | undefined }): string[][] {
    const data: string[][] = [];

    try {
      // Parse groups to get entry counts
      // Format: ["Category Name","","",entryCount,[]]
      const groupRegex = /\["([^"]+)(?:","[^"]*){2}",(\d+),/g;
      const entryCountMap: { [key: string]: string } = {};

      let groupMatch;
      while ((groupMatch = groupRegex.exec(groupsData)) !== null) {
        const categoryName = groupMatch[1].trim();
        const entryCount = groupMatch[2].trim();
        entryCountMap[categoryName] = entryCount;
      }

      // Parse each medal entry using regex to extract the string values
      // Format: ["Place","Type","ShowLabel","BrewerName","Group","Style","BeerName","Club",...]
      const medalRegex = /\["(\d+)","(\d+)","([^"]+)","([^"]+)","([^"]+)","([^"]+)","([^"]+)","([^"]+)"/g;

      let match;
      while ((match = medalRegex.exec(medalsData)) !== null) {
        const place = match[1].trim();
        const brewer = match[4].trim();
        const category = match[5].trim();
        const style = match[6].trim();
        const beerName = match[7].trim();
        const clubRaw = match[8].trim();
        const club = this.extractClubName(clubRaw);

        // Get entry count for this category
        const entryCount = entryCountMap[category] || '';

        // Convert place number to standard format: 1st, 2nd, 3rd, HM
        const medalText = this.convertMedalPlacement(place);

        const shouldInclude = this.shouldIncludeEntry(brewer, club, filters);

        if (shouldInclude) {
          data.push(this.createResultRow({
            beerName,
            brewer,
            category,
            club,
            entryCount,
            medalText,
            style
          }));
        }
      }
    } catch (error) {
      console.error('Error parsing Reggie JavaScript data:', error);
    }

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
