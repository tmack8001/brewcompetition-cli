import { expect } from 'chai';
import http from 'node:http';

import {
  BotChallengeError,
  HttpStatusError,
  fetchHtml,
  fetchJson,
  hasChallengeMarker,
  isChallengeResponse,
} from '../../src/http/fetch.js';

const CF_INTERSTITIAL = `<html><head><title>Just a moment...</title></head><body>
  <noscript>Enable JavaScript and cookies to continue</noscript>
  <script>window._cf_chl_opt = {};</script></body></html>`;

/**
 * Stands up a throwaway server on an ephemeral port.
 *
 * @param handler responds to each request
 * @returns the base URL, and a stop function
 */
async function serve(
  handler: (request: http.IncomingMessage, response: http.ServerResponse) => void
): Promise<{ stop: () => Promise<void>; url: string }> {
  const server = http.createServer(handler);
  await new Promise<void>(resolve => { server.listen(0, '127.0.0.1', resolve); });

  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no port');

  return {
    stop: () => new Promise<void>(resolve => { server.close(() => resolve()); }),
    url: `http://127.0.0.1:${address.port}`,
  };
}

/**
 * Runs something expected to reject and returns the error it rejected with.
 *
 * Written as a helper rather than `try { await …; expect.fail() } catch` because
 * that shape is unsound: `expect.fail` throws a chai AssertionError which the
 * test's own `catch` then asserts against, and a set of purely negative
 * assertions passes happily on the string "expected a rejection". One such test
 * was proven to pass both on a successful fetch and on an unrelated failure.
 *
 * @param run the call under test
 * @returns the rejection reason
 * @throws when the call resolves instead of rejecting
 */
async function rejection(run: () => Promise<unknown>): Promise<Error> {
  try {
    await run();
  } catch (error) {
    return error as Error;
  }

  throw new Error('expected the call to reject, but it resolved');
}

/**
 * True when the request looks like our plain axios client rather than an
 * impersonated browser, which is how these fixtures tell the two apart.
 *
 * @param request the inbound request
 * @returns `true` for the plain client
 */
function isPlainClient(request: http.IncomingMessage): boolean {
  return (request.headers['user-agent'] ?? '').includes('axios');
}

describe('Bot challenge detection', () => {
  it('should flag a Cloudflare interstitial by its cf-mitigated header', () => {
    expect(isChallengeResponse(403, '', { 'cf-mitigated': 'challenge' })).to.equal(true);
    expect(hasChallengeMarker('', { 'cf-mitigated': 'challenge' })).to.equal(true);
  });

  it('should flag a Cloudflare interstitial by its body', () => {
    expect(isChallengeResponse(200, CF_INTERSTITIAL, {})).to.equal(true);
    expect(hasChallengeMarker(CF_INTERSTITIAL, {})).to.equal(true);
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

  it('should distinguish a bare 403 from one carrying a challenge marker', () => {
    // Both are retried, but only the marker justifies telling the user the site
    // wants a JavaScript-capable browser.
    expect(hasChallengeMarker('<html>Forbidden</html>', {})).to.equal(false);
  });

  it('should leave a plain 200 alone', () => {
    expect(isChallengeResponse(200, '<html><body>results</body></html>', {})).to.equal(false);
  });
});

describe('fetchWithFallback', () => {
  it('should return the body of a plain 200 without impersonating anything', async () => {
    const { stop, url } = await serve((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<html><body>real page</body></html>');
    });

    try {
      expect(await fetchHtml(url)).to.contain('real page');
    } finally {
      await stop();
    }
  });

  it('should report a 404 as a 404, not as bot protection', async () => {
    // Impersonating Chrome does not make a missing page exist. Reporting this as
    // a challenge sent users looking for a browser problem that did not exist.
    const { stop, url } = await serve((_request, response) => {
      response.writeHead(404).end('nope');
    });

    try {
      const error = await rejection(() => fetchHtml(url));
      expect(error).to.be.instanceOf(HttpStatusError);
      expect((error as HttpStatusError).status).to.equal(404);
      expect(error).to.not.be.instanceOf(BotChallengeError);
    } finally {
      await stop();
    }
  });

  it('should report a 500 as a 500', async () => {
    const { stop, url } = await serve((_request, response) => {
      response.writeHead(500).end('boom');
    });

    try {
      const error = await rejection(() => fetchHtml(url));
      expect(error).to.be.instanceOf(HttpStatusError);
      expect((error as HttpStatusError).status).to.equal(500);
    } finally {
      await stop();
    }
  });

  it('should surface a connection failure as itself without impersonating', async () => {
    // Nothing is listening on this port; no fingerprint changes that. The negative
    // assertion alone is not enough - it passes even when ECONNREFUSED is wrongly
    // made retryable - so the code is asserted positively as well.
    const error = await rejection(() => fetchHtml('http://127.0.0.1:1'));

    expect(error).to.not.be.instanceOf(BotChallengeError);
    expect(error.message).to.match(/econnrefused/i);
    expect(error.message, 'must not have tried impersonation').to.not.contain('impersonation');
  });

  it('should surface a DNS failure as itself without impersonating', async () => {
    const error = await rejection(() => fetchHtml('http://no-such-host-abcxyz123.invalid/'));

    // Positively identify the failure. Asserting only the absence of two substrings
    // passed on a successful fetch and on an unrelated failure mode alike.
    expect(error.message).to.match(/enotfound|eai_again|getaddrinfo/i);
    expect(error.message).to.not.contain('impersonation');
    expect(error.message).to.not.contain('Could not reach');
  });

  it('should retry with impersonation and succeed when only the plain client is challenged', async () => {
    const seen: string[] = [];
    const { stop, url } = await serve((request, response) => {
      seen.push(isPlainClient(request) ? 'plain' : 'impersonated');

      if (isPlainClient(request)) {
        response.writeHead(403, { 'cf-mitigated': 'challenge', 'content-type': 'text/html' });
        response.end(CF_INTERSTITIAL);
        return;
      }

      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<html><body>the real results</body></html>');
    });

    try {
      expect(await fetchHtml(url)).to.contain('the real results');
      expect(seen).to.deep.equal(['plain', 'impersonated']);
    } finally {
      await stop();
    }
  });

  it('should prefer the plain client when impersonation is the thing being challenged', async () => {
    // Hostinger's hcdn behaves this way, which is why impersonation is a
    // fallback rather than the default.
    const { stop, url } = await serve((request, response) => {
      if (isPlainClient(request)) {
        response.writeHead(200, { 'content-type': 'text/html' });
        response.end('<html><body>served to plain clients</body></html>');
        return;
      }

      response.writeHead(403).end(CF_INTERSTITIAL);
    });

    try {
      expect(await fetchHtml(url)).to.contain('served to plain clients');
    } finally {
      await stop();
    }
  });

  it('should raise BotChallengeError when every strategy is challenged', async () => {
    const { stop, url } = await serve((_request, response) => {
      response.writeHead(403, { 'cf-mitigated': 'challenge', 'content-type': 'text/html' });
      response.end(CF_INTERSTITIAL);
    });

    try {
      const error = await rejection(() => fetchHtml(url));
      expect(error).to.be.instanceOf(BotChallengeError);
      expect((error as Error).message).to.contain('chrome impersonation');
      expect((error as Error).message).to.contain('firefox impersonation');
    } finally {
      await stop();
    }
  });

  it('should raise HttpStatusError when a bare 403 survives every strategy', async () => {
    // Retried, because bot walls do answer a bare 403 - but with nothing
    // identifying an interstitial, a private competition is the likelier reading.
    const { stop, url } = await serve((_request, response) => {
      response.writeHead(403, { 'content-type': 'text/html' }).end('<html>Forbidden</html>');
    });

    try {
      const error = await rejection(() => fetchHtml(url));
      expect(error).to.be.instanceOf(HttpStatusError);
      expect((error as HttpStatusError).status).to.equal(403);
      expect((error as Error).message).to.contain('impersonation');
    } finally {
      await stop();
    }
  });

  it('should report a real 404 found behind a challenge as a 404', async () => {
    // The plain client is walled off, impersonation gets through and finds the
    // page genuinely missing. The earlier challenge must not mask that.
    const { stop, url } = await serve((request, response) => {
      if (isPlainClient(request)) {
        response.writeHead(403, { 'cf-mitigated': 'challenge' }).end(CF_INTERSTITIAL);
        return;
      }

      response.writeHead(404).end('gone');
    });

    try {
      const error = await rejection(() => fetchHtml(url));
      expect(error).to.be.instanceOf(HttpStatusError);
      expect((error as HttpStatusError).status).to.equal(404);
      expect(error).to.not.be.instanceOf(BotChallengeError);
    } finally {
      await stop();
    }
  });

  it('should not attempt the second profile once one gets through', async () => {
    const profiles: string[] = [];
    const { stop, url } = await serve((request, response) => {
      if (isPlainClient(request)) {
        response.writeHead(403, { 'cf-mitigated': 'challenge' }).end(CF_INTERSTITIAL);
        return;
      }

      profiles.push(request.headers['user-agent'] ?? '');
      response.writeHead(200, { 'content-type': 'text/html' }).end('<html>ok</html>');
    });

    try {
      await fetchHtml(url);
      expect(profiles).to.have.lengthOf(1);
    } finally {
      await stop();
    }
  });

  it('should retry with impersonation when the plain client is reset mid-connection', async () => {
    // Some WAFs reject an unrecognised TLS fingerprint by destroying the socket
    // rather than answering with a status. Giving up on the reset meant never
    // reaching the fingerprint that would have worked.
    const { stop, url } = await serve((request, response) => {
      if (isPlainClient(request)) {
        request.destroy();
        response.destroy();
        return;
      }

      response.writeHead(200, { 'content-type': 'text/html' }).end('<html>past the reset</html>');
    });

    try {
      expect(await fetchHtml(url)).to.contain('past the reset');
    } finally {
      await stop();
    }
  });

  it('should not invent a status code when every attempt fails at the transport layer', async () => {
    // A reset on every strategy leaves no HTTP status to report; the initial value
    // surfaced as "failed with status code 0".
    const { stop, url } = await serve((request, response) => {
      request.destroy();
      response.destroy();
    });

    try {
      const error = await rejection(() => fetchHtml(url));
      expect((error as Error).message).to.contain('Could not reach');
      expect((error as Error).message).to.not.contain('status code 0');
      expect(error).to.not.be.instanceOf(HttpStatusError);
    } finally {
      await stop();
    }
  });

  it('should try the next profile when one is rate-limited', async () => {
    // A 429 is what an anti-bot layer returns when throttling one fingerprint, so
    // the other profile is still worth a try. Treating it as definitive aborted.
    let impersonated = 0;
    const { stop, url } = await serve((request, response) => {
      if (isPlainClient(request)) {
        response.writeHead(403).end('<html>Forbidden</html>');
        return;
      }

      impersonated += 1;
      if (impersonated === 1) {
        response.writeHead(429).end('slow down');
        return;
      }

      response.writeHead(200, { 'content-type': 'text/html' }).end('<html>second profile</html>');
    });

    try {
      expect(await fetchHtml(url)).to.contain('second profile');
      expect(impersonated).to.equal(2);
    } finally {
      await stop();
    }
  });

  it('should still abort on a definitive status rather than trying every profile', async () => {
    let impersonated = 0;
    const { stop, url } = await serve((request, response) => {
      if (isPlainClient(request)) {
        response.writeHead(403, { 'cf-mitigated': 'challenge' }).end(CF_INTERSTITIAL);
        return;
      }

      impersonated += 1;
      response.writeHead(404).end('gone');
    });

    try {
      const error = await rejection(() => fetchHtml(url));
      expect((error as HttpStatusError).status).to.equal(404);
      expect(impersonated).to.equal(1);
    } finally {
      await stop();
    }
  });

  it('should name both readings of a bare refusal that survived every strategy', async () => {
    // Bot walls do answer a bare 403, and so does a page that is not public.
    const { stop, url } = await serve((_request, response) => {
      response.writeHead(403).end('<html>Forbidden</html>');
    });

    try {
      const error = await rejection(() => fetchHtml(url));
      expect((error as Error).message).to.contain('bot protection');
      expect((error as Error).message).to.contain('not publicly readable');
    } finally {
      await stop();
    }
  });

  it('should report a direct 429 without the refusal hint', async () => {
    // 429 is not a retryable status, so this never enters the impersonation loop -
    // it is reported straight from the direct attempt. The hint about a page not
    // being public belongs to 403 and 503 only. The next test covers the case
    // where a transient status does survive the whole chain.
    const { stop, url } = await serve((_request, response) => {
      response.writeHead(429).end('slow down');
    });

    try {
      const error = await rejection(() => fetchHtml(url));
      expect((error as HttpStatusError).status).to.equal(429);
      expect((error as Error).message).to.not.contain('not publicly readable');
    } finally {
      await stop();
    }
  });

  it('should not call a transient status ambiguous after exhausting every strategy', async () => {
    // Reaches the tail of the chain, where the flag is actually computed: the plain
    // client is walled off with a bare 403 and both profiles are then throttled.
    // The direct-403 case alone never gets that far.
    const { stop, url } = await serve((request, response) => {
      if (isPlainClient(request)) {
        response.writeHead(403).end('<html>Forbidden</html>');
        return;
      }

      response.writeHead(429).end('slow down');
    });

    try {
      const error = await rejection(() => fetchHtml(url));
      expect((error as HttpStatusError).status).to.equal(429);
      expect((error as Error).message).to.contain('impersonation');
      expect((error as Error).message).to.not.contain('not publicly readable');
    } finally {
      await stop();
    }
  });

  it('should name the URL when the impersonated path returns unparseable JSON', async () => {
    const { stop, url } = await serve((request, response) => {
      if (isPlainClient(request)) {
        response.writeHead(403, { 'cf-mitigated': 'challenge' }).end(CF_INTERSTITIAL);
        return;
      }

      response.writeHead(200, { 'content-type': 'application/json' }).end('<html>maintenance</html>');
    });

    try {
      const error = await rejection(() => fetchJson(url));
      expect(error).to.be.instanceOf(TypeError);
      expect((error as Error).message).to.contain('Expected JSON');
      expect((error as Error).message).to.contain('127.0.0.1');
    } finally {
      await stop();
    }
  });

  it('should parse JSON on the direct path', async () => {
    const { stop, url } = await serve((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ competition: { competitionId: 'abc123' } }));
    });

    try {
      const body = await fetchJson<{ competition: { competitionId: string } }>(url);
      expect(body.competition.competitionId).to.equal('abc123');
    } finally {
      await stop();
    }
  });

  it('should refuse an HTML body dressed as JSON rather than typing it as the caller expects', async () => {
    // axios's silentJSONParsing hands back the raw string instead of throwing, so
    // without this guard fetchJson returns an error page typed as its payload.
    const { stop, url } = await serve((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('<html><body>maintenance</body></html>');
    });

    try {
      const error = await rejection(() => fetchJson(url));
      expect(error).to.be.instanceOf(TypeError);
      expect((error as Error).message).to.contain('Expected JSON');
    } finally {
      await stop();
    }
  });

  it('should parse JSON on the impersonated path', async () => {
    const { stop, url } = await serve((request, response) => {
      if (isPlainClient(request)) {
        response.writeHead(403, { 'cf-mitigated': 'challenge' }).end(CF_INTERSTITIAL);
        return;
      }

      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ results: { miniBos: {} } }));
    });

    try {
      const body = await fetchJson<{ results: { miniBos: object } }>(url);
      expect(body.results.miniBos).to.deep.equal({});
    } finally {
      await stop();
    }
  });
});
