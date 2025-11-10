import { expect } from 'chai';

import { detectPlatform } from '../../src/parsers/platform-detector.js';
import { Platform } from '../../src/parsers/types.js';

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
