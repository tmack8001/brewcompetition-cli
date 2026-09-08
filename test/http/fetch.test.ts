import { expect } from 'chai';

import { isChallengeResponse } from '../../src/http/fetch.js';

describe('Bot challenge detection', () => {
  it('should flag a Cloudflare interstitial by its cf-mitigated header', () => {
    expect(isChallengeResponse(403, '', { 'cf-mitigated': 'challenge' })).to.equal(true);
  });

  it('should flag a Cloudflare interstitial by its body', () => {
    const body = `<html><head><title>Just a moment...</title></head><body>
      <noscript>Enable JavaScript and cookies to continue</noscript>
      <script>window._cf_chl_opt = {};</script></body></html>`;
    expect(isChallengeResponse(200, body, {})).to.equal(true);
  });

  it('should flag a Hostinger CDN interstitial by its body', () => {
    const body = '<html><head><title>Checking your browser before accessing. Just a moment...</title></head></html>';
    expect(isChallengeResponse(200, body, {})).to.equal(true);
  });

  it('should not flag a real page that loads the Cloudflare challenge-platform script', () => {
    // Cloudflare injects this script into ordinary pages too, so its presence
    // alone must not be treated as a challenge.
    const body = `<html><body><div class="bcoem-winner-table"></div>
      <script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script></body></html>`;
    expect(isChallengeResponse(200, body, {})).to.equal(false);
  });

  it('should retry an unexplained 403 so impersonation gets a turn', () => {
    expect(isChallengeResponse(403, '<html>Forbidden</html>', {})).to.equal(true);
  });

  it('should leave a plain 200 alone', () => {
    expect(isChallengeResponse(200, '<html><body>results</body></html>', {})).to.equal(false);
  });
});
