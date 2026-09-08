import axios, { AxiosRequestConfig } from 'axios';

/**
 * Browser profiles impit impersonates, tried in order. Each profile mimics a
 * real browser's TLS/HTTP2 fingerprint, which is what bot-protection services
 * such as Cloudflare score requests on.
 */
const IMPERSONATION_PROFILES = ['chrome', 'firefox'] as const;

/**
 * Fragments that only appear on interstitial "prove you're a browser" pages.
 * These are served with a mix of 2xx and 4xx statuses depending on the vendor,
 * so the body has to be inspected rather than the status alone.
 */
const CHALLENGE_MARKERS = [
  'window._cf_chl_opt',
  '<title>Just a moment',
  'Enable JavaScript and cookies to continue',
  'Checking your browser before accessing',
];

export class BotChallengeError extends Error {
  constructor(url: string, attempts: string[]) {
    super(
      `Blocked by bot protection at ${url} (tried: ${attempts.join(', ')}). ` +
        `The site requires a browser that executes JavaScript; open it in a browser to confirm it is reachable.`
    );
    this.name = 'BotChallengeError';
  }
}

/**
 * Decides whether a response is a bot-protection interstitial rather than the
 * page that was asked for.
 *
 * @param status HTTP status code of the response
 * @param body response body, inspected only when it is a string
 * @param headers response headers, lower-cased keys
 * @returns `true` when the response should be retried with impersonation
 */
export function isChallengeResponse(status: number, body: unknown, headers: Record<string, unknown>): boolean {
  if (headers['cf-mitigated'] === 'challenge') {
    return true;
  }

  if (typeof body === 'string' && CHALLENGE_MARKERS.some(marker => body.includes(marker))) {
    return true;
  }

  // A 403/503 with no recognisable marker is still worth a retry with impersonation.
  return status === 403 || status === 503;
}

async function impitFetch(url: string, profile: string): Promise<{ body: string; ok: boolean; status: number }> {
  // Imported lazily so a missing/unsupported native binary degrades to a clear
  // error on challenged sites instead of breaking the CLI at startup.
  const { Impit } = await import('impit');
  const client = new Impit({ browser: profile as 'chrome' | 'firefox', followRedirects: true, timeout: 30_000 });
  const response = await client.fetch(url);
  const body = await response.text();

  const headers = Object.fromEntries(response.headers.entries());

  return {
    body,
    ok: response.status >= 200 && response.status < 300 && !isChallengeResponse(response.status, body, headers),
    status: response.status,
  };
}

/**
 * Fetches a URL, transparently retrying with browser impersonation when the
 * plain request is met with a bot-protection challenge.
 *
 * The plain axios request is tried first on purpose: some CDNs (Hostinger's
 * hcdn, for one) challenge browser-looking clients while letting ordinary HTTP
 * clients through, so impersonation is a fallback rather than the default.
 *
 * @param url the URL to fetch
 * @param config axios request options applied to the direct attempt
 * @returns the response body, parsed as JSON when `config.responseType` is `json`
 */
export async function fetchWithFallback<T = string>(url: string, config: AxiosRequestConfig = {}): Promise<T> {
  const attempts: string[] = [];

  try {
    const response = await axios.get<T>(url, { ...config, validateStatus: () => true });

    if (response.status >= 200 && response.status < 300 &&
        !isChallengeResponse(response.status, response.data, response.headers as Record<string, unknown>)) {
      return response.data;
    }

    attempts.push(`direct (HTTP ${response.status})`);
  } catch (error) {
    attempts.push(`direct (${error instanceof Error ? error.message : String(error)})`);
  }

  for (const profile of IMPERSONATION_PROFILES) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const { body, ok, status } = await impitFetch(url, profile);

      if (ok) {
        return (config.responseType === 'json' ? JSON.parse(body) : body) as T;
      }

      attempts.push(`${profile} impersonation (HTTP ${status})`);
    } catch (error) {
      attempts.push(`${profile} impersonation (${error instanceof Error ? error.message : String(error)})`);
    }
  }

  throw new BotChallengeError(url, attempts);
}

/**
 * Fetches an HTML document, retrying with browser impersonation when challenged.
 *
 * @param url the URL to fetch
 * @returns the raw HTML body
 */
export async function fetchHtml(url: string): Promise<string> {
  return fetchWithFallback<string>(url, { responseType: 'text' });
}

/**
 * Fetches a JSON document, retrying with browser impersonation when challenged.
 *
 * @param url the URL to fetch
 * @returns the parsed JSON body
 */
export async function fetchJson<T>(url: string): Promise<T> {
  return fetchWithFallback<T>(url, { responseType: 'json' });
}
