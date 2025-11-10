import { BAPParser } from './bap-parser.js';
import { BCOEMParser } from './bcoem-parser.js';
import { detectPlatform } from './platform-detector.js';
import { ReggieParser } from './reggie-parser.js';
import { CompetitionParser, Platform } from './types.js';

export function getParser(url: string): CompetitionParser {
  const platform = detectPlatform(url);
  
  switch (platform) {
    case Platform.BCOEM: {
      return new BCOEMParser();
    }

    case Platform.REGGIE: {
      return new ReggieParser();
    }

    case Platform.BAP: {
      return new BAPParser();
    }

    default: {
      throw new Error(`Unsupported platform: ${platform}`);
    }
  }
}
