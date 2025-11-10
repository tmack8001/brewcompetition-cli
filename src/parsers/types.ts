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
