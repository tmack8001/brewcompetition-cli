import { expect } from 'chai';

import { BAPParser } from '../../src/parsers/bap-parser.js';
import { detectPlatform } from '../../src/parsers/platform-detector.js';
import { ReggieParser } from '../../src/parsers/reggie-parser.js';
import { Platform, UnsupportedOperationError } from '../../src/parsers/types.js';

describe('Platform Detection', () => {
  it('should detect Reggie platform from reggiebeer.com URL', () => {
    const url = 'https://reggiebeer.com/ReggieWeb.php?Web=1000882';
    const platform = detectPlatform(url);
    expect(platform).to.equal(Platform.REGGIE);
  });

  it('should detect BAP platform from beerawardsplatform.com URL', () => {
    const url = 'https://beerawardsplatform.com/2025-ash-copper-state-cup/results';
    const platform = detectPlatform(url);
    expect(platform).to.equal(Platform.BAP);
  });

  it('should default to BCOEM for unknown hostnames', () => {
    const url = 'https://example.com/competition';
    const platform = detectPlatform(url);
    expect(platform).to.equal(Platform.BCOEM);
  });

  it('should handle URLs with subdomains', () => {
    const url = 'https://subdomain.reggiebeer.com/results';
    const platform = detectPlatform(url);
    expect(platform).to.equal(Platform.REGGIE);
  });
});

describe('Unimplemented operations', () => {
  // The competitions command treats this as fatal rather than folding it into its
  // candidate-failure list: trying a second URL on the same site cannot help, and
  // reporting it as "no competition metadata published" blames the competition for
  // a gap in this tool.
  const parsers: [string, { parseMetadata(html: string): Promise<unknown> }][] = [
    ['Reggie', new ReggieParser()],
    ['BAP', new BAPParser()],
  ];

  for (const [name, parser] of parsers) {
    it(`should raise a distinct error for unimplemented ${name} metadata`, async () => {
      try {
        await parser.parseMetadata('<html></html>');
      } catch (error) {
        expect(error, name).to.be.instanceOf(UnsupportedOperationError);
        expect((error as Error).message, name).to.contain('not yet implemented');
        return;
      }

      expect.fail(`${name} metadata parsing unexpectedly succeeded`);
    });
  }
});
