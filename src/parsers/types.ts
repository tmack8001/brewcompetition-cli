export interface MedalResult {
  brewer: string;
  club: string;
  entryCount: string;
  entryName: string;
  place: string;
  style: string;
}

export interface ParsedResults {
  data: string;
  header: string;
}

export interface ParsedMetadata {
  data: string;
  header: string;
}

export interface CompetitionParser {
  /**
   * Pages worth trying for competition metadata, most likely first.
   *
   * Implement when a platform keeps its metadata somewhere other than the URL a
   * user would naturally paste in. Omit to use the given URL as-is.
   */
  metadataUrls?(url: string): string[];

  parseMetadata(html: string): Promise<ParsedMetadata>;
  
  parseResults(
    html: string,
    filters: { brewers: string | undefined; club: string | undefined },
    url?: string
  ): Promise<ParsedResults | undefined>;
}

export enum Platform {
  BAP = 'bap',
  BCOEM = 'bcoem',
  REGGIE = 'reggie',
}
