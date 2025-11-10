import { expect } from 'chai';
import fs from 'node:fs';
import path from 'node:path';

import { ReggieParser } from '../../src/parsers/reggie-parser.js';

describe('Reggie Parser', () => {
  let parser: ReggieParser;
  let htmlRendered: string;
  let htmlRaw: string;

  before(() => {
    parser = new ReggieParser();
    const htmlRenderedPath = path.join(process.cwd(), 'test/resources/results/reggie_results.html');
    const htmlRawPath = path.join(process.cwd(), 'test/resources/results/reggie_results_raw.html');
    htmlRendered = fs.readFileSync(htmlRenderedPath, 'utf8');
    htmlRaw = fs.readFileSync(htmlRawPath, 'utf8');
  });

  describe('Rendered HTML (saved page)', () => {
    it('should parse results from rendered Reggie HTML', async () => {
      const result = await parser.parseResults(htmlRendered, { brewers: undefined, club: undefined });
      
      expect(result).to.not.be.undefined;
      expect(result?.header).to.include('Brewer');
      expect(result?.header).to.include('Medal');
      expect(result?.header).to.include('Style');
      expect(result?.data).to.include('Donald Schneider');
      expect(result?.data).to.include('American Lager');
    });

    it('should filter by brewer name', async () => {
      const result = await parser.parseResults(htmlRendered, { brewers: 'Donald Schneider', club: undefined });
      
      expect(result).to.not.be.undefined;
      expect(result?.data).to.include('Donald Schneider');
      expect(result?.data).to.not.include('Ryan Wankel');
    });

    it('should filter by club', async () => {
      const result = await parser.parseResults(htmlRendered, { brewers: undefined, club: 'Lakewood Fermentation Club' });
      
      expect(result).to.not.be.undefined;
      expect(result?.data).to.include('Lakewood Fermentation Club');
    });
  });

  describe('Raw JavaScript (live page)', () => {
    it('should parse results from raw JavaScript data', async () => {
      const result = await parser.parseResults(htmlRaw, { brewers: undefined, club: undefined });
      
      expect(result).to.not.be.undefined;
      expect(result?.header).to.include('Brewer');
      expect(result?.header).to.include('Medal');
      expect(result?.header).to.include('Style');
      expect(result?.data).to.include('Donald Schneider');
      expect(result?.data).to.include('American Lager');
    });

    it('should filter by brewer name from JavaScript data', async () => {
      const result = await parser.parseResults(htmlRaw, { brewers: 'Donald Schneider', club: undefined });
      
      expect(result).to.not.be.undefined;
      expect(result?.data).to.include('Donald Schneider');
      expect(result?.data).to.not.include('Ryan Wankel');
    });

    it('should filter by club from JavaScript data', async () => {
      const result = await parser.parseResults(htmlRaw, { brewers: undefined, club: 'Lakewood Fermentation Club' });
      
      expect(result).to.not.be.undefined;
      expect(result?.data).to.include('Lakewood Fermentation Club');
    });
  });
});
