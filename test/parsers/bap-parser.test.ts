import { expect } from 'chai';
import fs from 'node:fs';
import path from 'node:path';

import { BAPParser } from '../../src/parsers/bap-parser.js';

describe('BAP Parser', () => {
  let parser: BAPParser;
  let html: string;

  before(() => {
    parser = new BAPParser();
    const htmlPath = path.join(process.cwd(), 'test/resources/results/bap_results.html');
    html = fs.readFileSync(htmlPath, 'utf8');
  });

  describe('HTML Parsing (saved page)', () => {
    it('should parse results from BAP HTML', async () => {
      const result = await parser.parseResults(html, { brewers: undefined, club: undefined });
      
      expect(result).to.not.be.undefined;
      expect(result?.header).to.include('Brewer');
      expect(result?.header).to.include('Entry Name');
      expect(result?.header).to.include('Style');
      expect(result?.data).to.include('Christian Chandler');
      expect(result?.data).to.include('Arizona Society of Homebrewers');
    });

    it('should filter by brewer name', async () => {
      const result = await parser.parseResults(html, { brewers: 'Christian Chandler', club: undefined });
      
      expect(result).to.not.be.undefined;
      expect(result?.data).to.include('Christian Chandler');
    });

    it('should filter by club', async () => {
      const result = await parser.parseResults(html, { brewers: undefined, club: 'Arizona Society of Homebrewers' });
      
      expect(result).to.not.be.undefined;
      expect(result?.data).to.include('Arizona Society of Homebrewers');
    });
  });

  describe('API Parsing (live page)', () => {
    it('should extract competition key from URL', () => {
      const url = 'https://beerawardsplatform.com/2025-ash-copper-state-cup/results';
      // Access private method for testing
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const key = (parser as any).extractCompetitionKey(url);
      expect(key).to.equal('2025-ash-copper-state-cup');
    });

    it('should parse API data structure', async () => {
      // Load the API response fixtures
      const competitionInfoPath = path.join(process.cwd(), 'test/resources/api/bap_competition_info.json');
      const resultsPath = path.join(process.cwd(), 'test/resources/api/bap_results.json');
      
      const competitionInfo = JSON.parse(fs.readFileSync(competitionInfoPath, 'utf8'));
      const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
      
      // Verify the structure we expect
      expect(competitionInfo.competition).to.not.be.undefined;
      expect(competitionInfo.competition.competitionId).to.equal('Po3yXa0IULLxtPjWBlvm');
      expect(results.results).to.not.be.undefined;
      expect(results.results.miniBos).to.not.be.undefined;
    });

    it('should parse results from API data', async () => {
      // This test verifies the API data contains expected brewers
      const resultsPath = path.join(process.cwd(), 'test/resources/api/bap_results.json');
      const apiData = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
      
      const { miniBos } = apiData.results;
      const brewers = new Set<string>();
      
      // Extract all brewer names from the API data
      for (const categoryId in miniBos) {
        if (!Object.hasOwn(miniBos, categoryId)) continue;

        const category = miniBos[categoryId];
        const positions = category.positions || {};
        
        for (const position in positions) {
          if (!Object.hasOwn(positions, position)) continue;

          const entries = positions[position];
          if (!Array.isArray(entries)) continue;

          for (const entry of entries) {
            const brewer = entry.participant?.name || entry.participant?.displayName || '';
            if (brewer) brewers.add(brewer);
          }
        }
      }
      
      expect(brewers.has('Cheyne Harvey')).to.be.true;
      expect(brewers.has('Christian Chandler')).to.be.true;
    });
  });
});
