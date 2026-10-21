import { expect } from 'chai';

import { BAPParser } from '../../src/parsers/bap-parser.js';
import { detectPlatform, isBapHost, isHostOrSubdomain } from '../../src/parsers/platform-detector.js';
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const key = (url: string) => (new BAPParser() as any).extractCompetitionKey(url);

describe('Host matching', () => {
  it('should match the domain, its subdomains and a trailing-dot host', () => {
    for (const host of ['beerawardsplatform.com', 'www.beerawardsplatform.com', 'beerawardsplatform.com.']) {
      expect(isBapHost(host), host).to.equal(true);
    }
  });

  it('should match regardless of the case it is given', () => {
    expect(isBapHost('BeerAwardsPlatform.COM')).to.equal(true);
    expect(isHostOrSubdomain('WWW.ReggieBeer.com', 'reggiebeer.com')).to.equal(true);
  });

  it('should reject lookalike hosts', () => {
    for (const host of ['notbeerawardsplatform.com', 'beerawardsplatform.com.evil.example', 'beerawardsplatform.co', 'example.com', '']) {
      expect(isBapHost(host), host).to.equal(false);
    }
  });

  it('should detect BAP and Reggie from URLs with a trailing-dot host', () => {
    expect(detectPlatform('https://beerawardsplatform.com./some-comp')).to.equal(Platform.BAP);
    expect(detectPlatform('https://reggiebeer.com./ReggieWeb.php')).to.equal(Platform.REGGIE);
  });

  it('should not treat lookalike hosts as BAP or Reggie', () => {
    expect(detectPlatform('https://notbeerawardsplatform.com/some-comp')).to.equal(Platform.BCOEM);
    expect(detectPlatform('https://beerawardsplatform.com.evil.example/some-comp')).to.equal(Platform.BCOEM);
    expect(detectPlatform('https://notreggiebeer.com/x')).to.equal(Platform.BCOEM);
  });

  it('should extract the same BAP key the detector routes on', () => {
    expect(key('https://beerawardsplatform.com./some-comp')).to.equal('some-comp');
    expect(key('https://notbeerawardsplatform.com/some-comp')).to.equal(null);
  });
});
