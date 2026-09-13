import axios, { AxiosRequestConfig } from 'axios';

/**
 * Browser profiles impit impersonates, tried in order. Each profile mimics a
 * real browser's TLS/HTTP2 fingerprint, which is what bot-protection services
 * such as Cloudflare score requests on.
 */
const IMPERSONATION_PROFILES = ['chrome', 'firefox'] as const;

type ImpersonationProfile = typeof IMPERSONATION_PROFILES[number];

/** Applied to both the direct and the impersonated attempt. */
const REQUEST_TIMEOUT_MS = 30_000;

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

/**
 * Statuses worth a second attempt with a browser fingerprint even when the body
 * carries no recognisable marker. Bot walls commonly answer a bare 403, and
 * Cloudflare uses 503 for its older interstitial.
 */
const RETRYABLE_STATUSES = new Set([403, 503]);

/**
 * Statuses that say "not now" rather than "not ever", so the next profile is
 * still worth trying. A 429 is what an anti-bot layer returns when it is
 * rate-limiting one fingerprint, and a 5xx from a loaded CDN is transient; both
 * can succeed under a different profile.
 */
const TRANSIENT_STATUSES = new Set([408, 429, 500, 502, 504]);

/**
 * Transport failures worth retrying with a browser fingerprint.
 *
 * Some WAFs reject an unrecognised TLS fingerprint by resetting the connection
 * rather than answering with a status, so a reset is a plausible fingerprint
 * problem and impersonation can clear it. Contrast DNS failures and refused
 * connections, which say the host or port is simply not there - no fingerprint
 * changes that, so those are reported as themselves.
 */
const RETRYABLE_TRANSPORT_CODES = new Set([
  'ECONNABORTED',
  'ECONNRESET',
  'EPIPE',
  'EPROTO',
  'ETIMEDOUT',
]);

/** Raised when every strategy was met with a bot-protection interstitial. */
export class BotChallengeError extends Error {
  constructor(url: string, attempts: string[]) {
    super(
      `Blocked by bot protection at ${url} (tried: ${attempts.join('; ')}). ` +
        `The site requires a browser that executes JavaScript; open it in a browser to confirm it is reachable.`
    );
    this.name = 'BotChallengeError';
  }
}

/**
 * Raised when a server refused the request and nothing suggested a challenge -
 * a private or withdrawn competition, say. Kept distinct from
 * {@link BotChallengeError} so the CLI does not tell someone to open a browser
 * when the page is simply not theirs to read.
 */
export class HttpStatusError extends Error {
  readonly status: number;

  constructor(url: string, status: number, attempts: string[] = [], ambiguous = false) {
    const tried = attempts.length > 0 ? ` (tried: ${attempts.join('; ')})` : '';
    // A refusal that survived browser impersonation is genuinely ambiguous: bot
    // walls do answer a bare 403, and so does a page that is simply not public.
    // Naming both beats asserting either.
    const hint = ambiguous
      ? ' - either bot protection this tool cannot clear, or a page that is not publicly readable'
      : '';
    super(`Request to ${url} failed with status code ${status}${tried}${hint}`);
    this.name = 'HttpStatusError';
    this.status = status;
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
  return hasChallengeMarker(body, headers) || RETRYABLE_STATUSES.has(status);
}

/**
 * Whether a response positively identifies itself as an interstitial, as opposed
 * to merely carrying a status worth retrying.
 *
 * The distinction decides which error the caller ends up with: a marker means
 * bot protection, a bare status does not.
 *
 * @param body response body, inspected only when it is a string
 * @param headers response headers, lower-cased keys
 * @returns `true` when a challenge fingerprint is present
 */
export function hasChallengeMarker(body: unknown, headers: Record<string, unknown>): boolean {
  if (headers['cf-mitigated'] === 'challenge') return true;

  return typeof body === 'string' && CHALLENGE_MARKERS.some(marker => body.includes(marker));
}

/** Signals that impit itself could not be loaded, so no profile will work. */
class ImpersonationUnavailableError extends Error {}

const clients = new Map<ImpersonationProfile, unknown>();

async function impitClient(profile: ImpersonationProfile) {
  // Imported lazily so a missing or unsupported native binary degrades to a
  // clear error on challenged sites instead of breaking the CLI at startup.
  // Cached per profile to reuse the connection pool across the several pages a
  // single command fetches. Note this does not share cookies: impit keeps no
  // cookie jar unless one is passed, and none is.
  const cached = clients.get(profile);
  if (cached) return cached as { fetch(url: string, init?: { headers?: Record<string, string> }): Promise<Response> };

  let Impit;
  try {
    ({ Impit } = await import('impit'));
  } catch (error) {
    // impit's loader failure is a multi-paragraph dump of every binary it tried.
    // Collapse it, or it lands in the middle of the caller's error message.
    throw new ImpersonationUnavailableError(
      `browser impersonation unavailable: the impit native binding failed to load for ${process.platform}-${process.arch}`,
      { cause: error }
    );
  }

  const client = new Impit({ browser: profile, followRedirects: true, timeout: REQUEST_TIMEOUT_MS });
  clients.set(profile, client);

  return client;
}

interface Attempt {
  body: string;
  challenged: boolean;
  marker: boolean;
  ok: boolean;
  status: number;
}

async function impitFetch(url: string, profile: ImpersonationProfile, headers?: Record<string, string>): Promise<Attempt> {
  const client = await impitClient(profile);
  const response = await client.fetch(url, headers ? { headers } : undefined);
  const body = await response.text();
  const responseHeaders = Object.fromEntries(response.headers.entries());

  const marker = hasChallengeMarker(body, responseHeaders);
  const challenged = isChallengeResponse(response.status, body, responseHeaders);

  return {
    body,
    challenged,
    marker,
    ok: response.status >= 200 && response.status < 300 && !challenged,
    status: response.status,
  };
}

function parseBody<T>(body: string, config: AxiosRequestConfig, url: string): T {
  if (config.responseType !== 'json') return body as T;

  try {
    return JSON.parse(body) as T;
  } catch {
    throw new TypeError(`Expected JSON from ${url} but received a non-JSON body`);
  }
}

/**
 * Fetches a URL, transparently retrying with browser impersonation when the
 * plain request is met with a bot-protection challenge.
 *
 * The plain axios request is tried first on purpose: some CDNs (Hostinger's
 * hcdn, for one) challenge browser-looking clients while letting ordinary HTTP
 * clients through, so impersonation is a fallback rather than the default.
 *
 * A challenge triggers the fallback, and so does a transport failure that could
 * plausibly be the fingerprint's fault - some WAFs reset the connection instead of
 * answering. A 404, a 500, a DNS failure or a refused connection are reported as
 * themselves: impersonating Chrome does not make a missing page exist, and
 * dressing every failure up as bot protection sends the user looking in the wrong
 * place.
 *
 * @param url the URL to fetch
 * @param config axios request options applied to the direct attempt
 * @returns the response body, parsed as JSON when `config.responseType` is `json`
 * @throws {BotChallengeError} when every strategy was met with an interstitial
 * @throws {HttpStatusError} when the server refused and nothing suggested a challenge
 */
export async function fetchWithFallback<T = string>(url: string, config: AxiosRequestConfig = {}): Promise<T> {
  const attempts: string[] = [];
  let sawMarker = false;
  let lastStatus: number | undefined;
  let transportError: unknown;

  try {
    const response = await axios.get<T>(url, {
      timeout: REQUEST_TIMEOUT_MS,
      ...config,
      validateStatus: () => true,
    });
    const headers = response.headers as unknown as Record<string, unknown>;

    if (!isChallengeResponse(response.status, response.data, headers)) {
      if (response.status < 200 || response.status >= 300) {
        throw new HttpStatusError(url, response.status);
      }

      return assertExpectedType<T>(url, response.data, config);
    }

    sawMarker = hasChallengeMarker(response.data, headers);
    lastStatus = response.status;
    attempts.push(`direct (HTTP ${response.status})`);
  } catch (error) {
    if (error instanceof HttpStatusError || error instanceof TypeError) throw error;

    const code = (error as { code?: string }).code ?? '';
    if (!RETRYABLE_TRANSPORT_CODES.has(code)) throw error;

    transportError = error;
    attempts.push(`direct (${code})`);
  }

  for (const profile of IMPERSONATION_PROFILES) {
    let attempt: Attempt;

    try {
      // eslint-disable-next-line no-await-in-loop
      attempt = await impitFetch(url, profile, config.headers as Record<string, string> | undefined);
    } catch (error) {
      if (error instanceof ImpersonationUnavailableError) {
        // No profile will load, so stop rather than repeating the same failure.
        attempts.push(error.message);
        break;
      }

      transportError = error;
      attempts.push(`${profile} impersonation (${error instanceof Error ? error.message : String(error)})`);
      continue;
    }

    if (attempt.ok) {
      return assertExpectedType<T>(url, parseBody<T>(attempt.body, config, url), config);
    }

    if (!attempt.challenged && !TRANSIENT_STATUSES.has(attempt.status)) {
      // This strategy got past the wall and the answer is definitive, so it is the
      // site's real answer. Reporting bot protection here because an *earlier*
      // attempt was challenged would hide a genuine 404.
      throw new HttpStatusError(url, attempt.status, attempts);
    }

    sawMarker ||= attempt.marker;
    lastStatus = attempt.status;
    attempts.push(`${profile} impersonation (HTTP ${attempt.status})`);
  }

  // A recognisable interstitial means bot protection. A bare refusal that
  // survived every strategy is reported as its status, flagged as ambiguous.
  if (sawMarker) {
    throw new BotChallengeError(url, attempts);
  }

  // No attempt ever got as far as an HTTP status, so there is no status to
  // report. Reporting the initial value here produced "failed with status code 0".
  if (lastStatus === undefined) {
    throw new Error(
      `Could not reach ${url} (tried: ${attempts.join('; ')})`,
      transportError === undefined ? undefined : { cause: transportError }
    );
  }

  throw new HttpStatusError(url, lastStatus, attempts, RETRYABLE_STATUSES.has(lastStatus));
}

/**
 * Guards the JSON contract. With axios's default `silentJSONParsing`, a body that
 * is not JSON comes back as a raw string rather than an error, so `fetchJson`
 * would hand a caller an HTML error page typed as its expected shape.
 *
 * @param url the URL that was fetched, for the error message
 * @param data the body as parsed so far
 * @param config the request options, read for `responseType`
 * @returns the body, unchanged
 */
function assertExpectedType<T>(url: string, data: T, config: AxiosRequestConfig): T {
  if (config.responseType === 'json' && (typeof data !== 'object' || data === null)) {
    throw new TypeError(`Expected JSON from ${url} but received ${typeof data === 'string' ? 'a non-JSON body' : typeof data}`);
  }

  return data;
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
