import moment from 'moment-timezone';

/**
 * Every zone BCOEM can render a date in, from the offset table in
 * `lib/date_time.lib.php`, ordered west to east as upstream orders it. That
 * ordering settles abbreviations more than one zone shares: `CDT` resolves to
 * `America/Chicago` rather than anything further east, `IST` to `Asia/Calcutta`
 * rather than `Europe/Dublin`.
 *
 * Two pairs are deliberately reordered against upstream. A North American
 * *standard* abbreviation always denotes a fixed offset, and a DST zone only ever
 * emits it while sitting at that offset - so resolving `MST` to Phoenix and `CST`
 * to Regina is correct for Denver and Chicago too, while the reverse silently
 * shifts an Arizona or Saskatchewan competition by an hour every summer.
 */
const UPSTREAM_ZONES = [
  'Pacific/Kwajalein', 'Pacific/Midway', 'Pacific/Honolulu', 'Pacific/Marquesas',
  'America/Anchorage', 'America/Los_Angeles', 'America/Phoenix', 'America/Denver',
  'America/Regina', 'America/Chicago', 'America/Hermosillo', 'America/New_York',
  'America/Bogota', 'America/Virgin', 'America/Asuncion', 'America/Halifax',
  'America/Santiago', 'America/Thule', 'America/St_Johns',
  'America/Argentina/Buenos_Aires', 'America/Sao_Paulo', 'Atlantic/South_Georgia',
  'Atlantic/Azores', 'Europe/London', 'Europe/Paris', 'Europe/Helsinki',
  'Europe/Moscow', 'Asia/Tehran', 'Asia/Baku', 'Asia/Kabul', 'Asia/Karachi',
  'Asia/Calcutta', 'Asia/Kathmandu', 'Asia/Colombo', 'Asia/Bangkok',
  'Asia/Singapore', 'Australia/Perth', 'Asia/Tokyo', 'Asia/Seoul',
  'Australia/Darwin', 'Pacific/Guam', 'Australia/Brisbane', 'Australia/Melbourne',
  'Asia/Magadan', 'Asia/Kamchatka', 'Pacific/Tongatapu',
];

/**
 * Abbreviation to IANA zone, derived from {@link UPSTREAM_ZONES} rather than
 * hand-written.
 *
 * BCOEM stamps its dates with PHP's `T`, which yields whatever abbreviation the
 * zone uses on that date - so standard and daylight forms both occur, and a
 * hand-kept list drifts. Sampling each zone in January and July picks up both.
 */
const ZONE_BY_ABBREVIATION: Map<string, string> = (() => {
  const index = new Map<string, string>();
  const probes = [Date.UTC(2026, 0, 15), Date.UTC(2026, 6, 15)];

  for (const zone of UPSTREAM_ZONES) {
    for (const probe of probes) {
      const abbreviation = moment.tz(probe, zone).format('z').toUpperCase();
      // Zones without a real abbreviation format as a numeric offset; those are
      // handled as offsets instead, so skip them here.
      if (!/^[+-]/.test(abbreviation) && !index.has(abbreviation)) {
        index.set(abbreviation, zone);
      }
    }
  }

  return index;
})();

/** How a `short` date orders its parts, per BCOEM's `prefsDateFormat`. */
export type ShortDateOrder = 'DMY' | 'MDY' | 'YMD';

/**
 * Resolves a timezone stamp to something moment can use.
 *
 * Returns `undefined` for anything unrecognised rather than falling back to the
 * machine's own zone: guessing turns an unknown stamp into a confident, wrong
 * instant, and a competition 15 hours out is worse than one with no date.
 *
 * @param stamp the trailing timezone token, e.g. `EDT`, `AEDT`, `+0530`
 * @returns an IANA zone name, a fixed-offset string moment accepts, or `undefined`
 */
export function resolveTimezone(stamp: string): string | undefined {
  const trimmed = stamp.trim();

  // PHP renders zones with no abbreviation as a numeric offset, e.g. "+0530".
  const offset = /^([+-])(\d{2}):?(\d{2})$/.exec(trimmed) ?? /^([+-])(\d{1,2})$/.exec(trimmed);
  if (offset) {
    const sign = offset[1];
    const hours = offset[2].padStart(2, '0');
    const minutes = (offset[3] ?? '00').padStart(2, '0');
    return `${sign}${hours}:${minutes}`;
  }

  return ZONE_BY_ABBREVIATION.get(trimmed.toUpperCase());
}

function instantIn(text: string, formats: string[], zone: string): Date | undefined {
  const fixedOffset = /^[+-]\d{2}:\d{2}$/.test(zone);
  const parsed = fixedOffset
    ? moment.utc(`${text}${zone}`, formats.map(format => `${format}Z`))
    : moment.tz(text, formats, zone);

  return parsed.isValid() ? parsed.toDate() : undefined;
}

export interface ParsedTimestamp {
  date: Date;
  /** Offset of the match in the source text, used to order and pair timestamps. */
  index: number;
}

const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December';
const WEEKDAYS = 'Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday';

/**
 * Matches every date-time BCOEM's renderer can produce.
 *
 * `getTimeZoneDateTime` in `lib/date_time.lib.php` composes a date, a time and a
 * zone, each independently configurable, so a single pattern per install would
 * cover only that install:
 *
 * - date, `long`:  `l, F j, Y` or `l j F, Y` - the latter on any install whose
 *   `prefsDateFormat` is not 1, which includes every non-US default
 * - date, `short`: `m/d/Y`, `d/m/Y` or `Y/m/d`. (`prefsDateFormat` 999 renders
 *   `Y-m-d H:i:s`, but its only caller asks for a zone-less format, so those
 *   timestamps carry no zone and are correctly ignored.)
 * - time:          `g:i A` (12-hour) or `H:i` (24-hour)
 *
 * The weekday is consumed but deliberately not parsed. Feeding it to moment as
 * `dddd` gains nothing - the date is already unambiguous - while making the whole
 * parse fail on a translated, abbreviated or simply mismatched day name.
 */
const TIMESTAMP_PATTERNS: { formats: string[]; pattern: RegExp; short?: boolean }[] = [
  {
    // "Friday, August 14, 2026 12:00 AM, EDT"
    formats: ['MMMM D YYYY h:mm A', 'MMMM D YYYY H:mm'],
    pattern: new RegExp(
      String.raw`(?:${WEEKDAYS}),?\s+(${MONTHS})\s+(\d{1,2}),\s*(\d{4})\s+(\d{1,2}:\d{2}(?:\s*[AP]M)?),\s*([A-Za-z]+|[+-]\d{2}(?::?\d{2})?)`,
      'gi'
    ),
  },
  {
    // "Friday 14 August, 2026 12:00 AM, EDT"
    formats: ['D MMMM YYYY h:mm A', 'D MMMM YYYY H:mm'],
    pattern: new RegExp(
      String.raw`(?:${WEEKDAYS}),?\s+(\d{1,2})\s+(${MONTHS}),\s*(\d{4})\s+(\d{1,2}:\d{2}(?:\s*[AP]M)?),\s*([A-Za-z]+|[+-]\d{2}(?::?\d{2})?)`,
      'gi'
    ),
  },
  {
    // "08/14/2026 5:00 PM, EDT" / "14/08/2026 ..." / "2026/08/14 ..." / "2026-08-14 17:00:00 ..."
    formats: [],
    pattern:
      /(\d{1,4})[/-](\d{1,2})[/-](\d{1,4})\s+(\d{1,2}(?::\d{2}){1,2}(?:\s*[ap]m)?),\s*([a-z]+|[+-]\d{2}(?::?\d{2})?)/gi,
    short: true,
  },
];

/**
 * Matches a numeric date only where BCOEM itself rendered one: followed by a
 * clock and a timezone stamp.
 *
 * Sampling bare `d/d/d` runs across the page instead picks up dates in inline
 * scripts, asset paths and analytics payloads. One ISO-looking timestamp in a
 * `<script>` was enough to declare the whole page year-first, after which every
 * card date parsed as a different year or not at all.
 */
const SHORT_DATE_IN_CONTEXT =
  /\b(\d{1,4})[/-](\d{1,2})[/-](\d{1,4})\s+\d{1,2}(?::\d{2}){1,2}(?:\s*[ap]m)?,\s*(?:[a-z]+|[+-]\d{2}(?::?\d{2})?)\b/gi;

/**
 * Infers how an install orders the parts of a `short` date.
 *
 * `m/d/Y` and `d/m/Y` are indistinguishable for a single date whose day is 12 or
 * less, so every rendered date on the page is sampled: one with a first part
 * above 12 settles it as day-first, one with a second part above 12 as
 * month-first. US order is the default, matching BCOEM's `prefsDateFormat` of 1.
 *
 * @param html the page source
 * @returns the inferred order
 */
export function detectShortDateOrder(html: string): ShortDateOrder {
  let dayFirst = false;
  let monthFirst = false;
  let yearFirst = false;

  for (const match of html.matchAll(SHORT_DATE_IN_CONTEXT)) {
    const [, first, second] = match;

    if (first.length === 4) {
      yearFirst = true;
      continue;
    }

    if (Number(first) > 12) dayFirst = true;
    if (Number(second) > 12) monthFirst = true;
  }

  // Ambiguity resolves toward US order, the upstream default, but a page that
  // demonstrates day-first or year-first ordering is believed.
  if (yearFirst && !dayFirst && !monthFirst) return 'YMD';
  if (dayFirst && !monthFirst) return 'DMY';

  return 'MDY';
}

function shortFormats(order: ShortDateOrder): string[] {
  const date = order === 'DMY' ? 'DD/MM/YYYY' : (order === 'YMD' ? 'YYYY/MM/DD' : 'MM/DD/YYYY');

  return [`${date} h:mm A`, `${date} H:mm`, `${date} H:mm:ss`];
}

/**
 * Extracts every timestamp in a piece of BCOEM text, in document order.
 *
 * @param text the sentence or paragraph to read
 * @param order how this install orders `short` dates, from {@link detectShortDateOrder}
 * @returns the timestamps found, each with its position in the text
 */
export function parseTimestamps(text: string, order: ShortDateOrder = 'MDY'): ParsedTimestamp[] {
  const found: ParsedTimestamp[] = [];

  for (const { formats, pattern, short } of TIMESTAMP_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const zone = resolveTimezone(match[5]);
      if (!zone) continue;

      const normalised = short
        ? `${match[1]}/${match[2]}/${match[3]} ${match[4]}`
        : `${match[1]} ${match[2]} ${match[3]} ${match[4]}`;

      const date = instantIn(normalised, short ? shortFormats(order) : formats, zone);
      if (date) found.push({ date, index: match.index });
    }
  }

  return found.sort((a, b) => a.index - b.index);
}

/**
 * Phrases that mark a lone timestamp as closing or opening a window, from the
 * English sentence templates in `lang/en/en-US.lang.php`.
 *
 * `today` and `now` are deliberately absent from the opening set. Upstream uses
 * them *in place of* an opening timestamp once the window is already open - "You
 * can create your account today through <date>" - so the only rendered date in
 * those sentences is the deadline. Treating them as opening cues put the closing
 * date in the start column for every competition currently taking entries, which
 * is the most common live state there is.
 */
const CLOSING_CUES = /\b(?:through|until|by|closes?|closed|deadline|no later than)\b/gi;
const OPENING_CUES = /\b(?:beginning|begins?|opens?|opening|from|starting|accepted from)\b/gi;

/**
 * Classifies a lone timestamp by the cue closest to it.
 *
 * Requiring one set to match exclusively fails on upstream's open-state
 * sentences, which contain both an opening word and a closing one; the cue
 * nearest the date is the one that governs it.
 *
 * @param lead the text preceding the timestamp
 * @returns which bound the timestamp represents, or `undefined` when unmarked
 */
function nearestCue(lead: string): 'end' | 'start' | undefined {
  let nearest: { at: number; kind: 'end' | 'start' } | undefined;

  for (const [pattern, kind] of [[CLOSING_CUES, 'end'], [OPENING_CUES, 'start']] as const) {
    for (const match of lead.matchAll(pattern)) {
      if (!nearest || match.index > nearest.at) nearest = { at: match.index, kind };
    }
  }

  return nearest?.kind;
}

/**
 * Reads a window out of a BCOEM sentence.
 *
 * A pair of timestamps is a start and an end. A single timestamp is ambiguous:
 * BCOEM renders the sentence whenever the deadline is set, so "accepted through
 * Friday ..." states only a close. The cue nearest the date decides which bound it
 * is; an unmarked date is treated as a moment in time and reported as the start,
 * which is what an awards ceremony is.
 *
 * @param text the sentence to read
 * @param order how this install orders `short` dates
 * @returns the window bounds, either possibly `undefined`
 */
export function extractWindow(
  text: string,
  order: ShortDateOrder = 'MDY'
): { end: Date | undefined; start: Date | undefined } {
  return readWindow(text, order, false);
}

/**
 * Reads a single instant out of text that is a moment rather than a window.
 *
 * Used for the awards ceremony, the one field whose lone date is preceded entirely
 * by admin free-text - the venue name and address share its paragraph. A cue word
 * in either would otherwise move the ceremony into the closing column, and real
 * venues supply them: "Deadline Brewing Parlor", "Brewery by the Bay".
 *
 * @param text the paragraph to read
 * @param order how this install orders `short` dates
 * @returns a lone instant as the start with no end; a pair is still read as a
 *   window, since two stated timestamps are unambiguous whatever the wording
 */
export function extractMoment(
  text: string,
  order: ShortDateOrder = 'MDY'
): { end: Date | undefined; start: Date | undefined } {
  return readWindow(text, order, true);
}

function readWindow(
  text: string,
  order: ShortDateOrder,
  bare: boolean
): { end: Date | undefined; start: Date | undefined } {
  const stamps = parseTimestamps(text, order);

  if (stamps.length === 0) return { end: undefined, start: undefined };

  if (stamps.length >= 2) {
    const [first, second] = stamps;
    // Never emit an inverted window; if the page reads backwards, trust the order
    // of the instants rather than the order of the prose.
    return first.date <= second.date
      ? { end: second.date, start: first.date }
      : { end: first.date, start: second.date };
  }

  const only = stamps[0];
  const cue = bare ? undefined : nearestCue(text.slice(0, only.index));

  if (cue === 'end') return { end: only.date, start: undefined };

  // Either framed as an opening, or a bare timestamp with no framing at all - an
  // awards ceremony, typically, which is a moment rather than a window.
  return { end: undefined, start: only.date };
}

/**
 * Formats an instant for the human-readable column, in the competition's own
 * timezone and carrying the zone so a reader can place it.
 *
 * A fixed offset is not a moment-timezone zone. Passing one to `.tz()` logs a
 * warning and leaves the moment in the host's zone, which rolls the clock and
 * sometimes the date - the very host-dependence this column exists to avoid - and
 * drops the zone label, leaving a dangling comma. Nineteen of the zones BCOEM can
 * be configured for have no lettered abbreviation, so this is the common path and
 * not an edge case.
 *
 * @param date the instant
 * @param zone the IANA zone name, or a fixed offset such as `-03:00`
 * @returns the formatted timestamp
 */
export function formatInZone(date: Date, zone: string): string {
  if (/^[+-]\d{2}:\d{2}$/.test(zone)) {
    return moment(date).utcOffset(zone).format('dddd, MMMM D, YYYY h:mm A, [UTC]Z');
  }

  return moment(date).tz(zone).format('dddd, MMMM D, YYYY h:mm A, z');
}
