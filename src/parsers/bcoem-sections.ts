import cheerio from 'cheerio';
import moment from 'moment-timezone';

/**
 * A single `<h2>` block of a BCOEM entry-info page, together with the
 * paragraphs that belong to it.
 */
export interface BcoemSection {
  /** `name` of the anchor immediately preceding the heading, when there is one. */
  anchor: string | undefined;
  /** Heading text, whitespace collapsed. */
  heading: string;
  /** Paragraph texts belonging to this heading, in document order. */
  paragraphs: string[];
}

/**
 * Headings that introduce each field we care about, as emitted by the English
 * language pack in `lang/en/en-US.lang.php`. Matched case-insensitively against
 * the start of the heading, because newer BCOEM builds append a status to it -
 * `Entry Registration is Open`, for example.
 *
 * Two of these have more than one spelling. Drop-off is labelled `Entry
 * Delivery` when the competition has a single location and `Drop-Off Locations`
 * when it has several. Volunteer registration only gets a heading of its own on
 * the newer builds; older ones fold it into the Account Registration section as
 * a second paragraph.
 */
const HEADING_PATTERNS = {
  accountRegistration: [/^account registration/i],
  awardsCeremony: [/^awards ceremony/i],
  dropOff: [/^drop-?off/i, /^entry delivery/i],
  entryAcceptanceRules: [/^entry acceptance rules/i],
  entryRegistration: [/^entry registration/i],
  shipping: [/^shipping/i],
  volunteerRegistration: [/^judge and steward registration/i, /^judges? and stewards? registration/i, /^volunteer registration/i],
} as const;

/**
 * Anchors the older builds emit, used as a fallback when heading matching comes
 * up empty. The anchor is the heading lowercased with spaces hyphenated, so it
 * changes on a translated install - which is exactly why it is the fallback and
 * not the primary lookup. `reg_window` is the one anchor BCOEM hardcodes.
 */
const ANCHOR_NAMES = {
  accountRegistration: ['reg_window'],
  awardsCeremony: ['awards-ceremony'],
  dropOff: ['drop-off-locations', 'entry-delivery'],
  entryAcceptanceRules: ['entry-acceptance-rules'],
  entryRegistration: ['entry-registration'],
  shipping: ['shipping-info'],
  volunteerRegistration: [],
} as const;

export type BcoemField = keyof typeof HEADING_PATTERNS;

function collapse(text: string): string {
  return text.replaceAll(/\s+/g, ' ').trim();
}

/**
 * Splits a BCOEM entry-info page into its `<h2>` sections.
 *
 * Paragraphs are gathered with `nextUntil('h2')` so they stop at the following
 * heading. The original implementation used `nextAll('p')`, which walks past the
 * end of a section and pulls in the next one's paragraphs whenever a section is
 * shorter than expected - which happens routinely, because a closed competition
 * renders one paragraph where an open one renders two.
 *
 * @param html the entry-info page source
 * @returns one entry per `<h2>`, in document order
 */
export function extractSections(html: string): BcoemSection[] {
  const $ = cheerio.load(html);
  const sections: BcoemSection[] = [];

  $('h2').each((_index, element) => {
    const heading = collapse($(element).text());
    if (!heading) return;

    const anchorEl = $(element).prevAll('a[name]').first();
    const anchor = anchorEl.length > 0 ? anchorEl.attr('name') : undefined;

    const paragraphs: string[] = [];
    $(element)
      .nextUntil('h2')
      .each((_paraIndex, sibling) => {
        const $sibling = $(sibling);
        const candidates = $sibling.is('p') ? $sibling : $sibling.find('p');
        candidates.each((_i, p) => {
          const text = collapse($(p).text());
          if (text) paragraphs.push(text);
        });
      });

    sections.push({ anchor, heading, paragraphs });
  });

  return sections;
}

/**
 * Finds the section for a field by heading, then by anchor.
 *
 * @param sections output of {@link extractSections}
 * @param field the field to locate
 * @returns the matching section, or `undefined` when the competition does not render it
 */
export function findSection(sections: BcoemSection[], field: BcoemField): BcoemSection | undefined {
  const byHeading = sections.find(section =>
    HEADING_PATTERNS[field].some(pattern => pattern.test(section.heading))
  );

  if (byHeading) return byHeading;

  const anchors: readonly string[] = ANCHOR_NAMES[field];
  return sections.find(section => section.anchor !== undefined && anchors.includes(section.anchor));
}

/**
 * Reads one paragraph out of a field's section.
 *
 * @param sections output of {@link extractSections}
 * @param field the field to read
 * @param index which paragraph of the section to take
 * @returns the paragraph text, or an empty string when absent
 */
export function sectionParagraph(sections: BcoemSection[], field: BcoemField, index = 0): string {
  return findSection(sections, field)?.paragraphs[index] ?? '';
}

/**
 * Finds the "number of bottles required per entry" paragraph.
 *
 * BCOEM appends this to the Entry Acceptance Rules body but outside the guard
 * that renders that section's heading, so on a competition whose drop-off and
 * shipping windows have both closed the paragraph detaches and trails whichever
 * section happened to come before it. Searching every section is the only way to
 * find it reliably.
 *
 * @param sections output of {@link extractSections}
 * @returns the paragraph text, or an empty string when absent
 */
export function findBottleRequirement(sections: BcoemSection[]): string {
  // Anchored at the end so it matches the label form BCOEM emits -
  // "Number of Bottles Required Per Entry: 2" - and not the clock in
  // "... accepted at our drop-off locations Friday, August 14, 2026 12:00 AM".
  const pattern = /bottles?[^:]{0,40}:\s*\d+\s*$/i;

  for (const section of sections) {
    const match = section.paragraphs.find(paragraph => pattern.test(paragraph));
    if (match) return match;
  }

  return sectionParagraph(sections, 'entryAcceptanceRules');
}

/** A window read from an "At a Glance" card: the card's title, and its bounds. */
export interface GlanceWindow {
  close: Date | undefined;
  open: Date | undefined;
  /** Compact rendering of the card, for the human-readable column. */
  summary: string;
}

/**
 * Glance-card titles per field. Newer BCOEM builds lead the entry-info page with
 * an "At a Glance" grid stating each window as an explicit timestamp pair, which
 * is worth preferring over the prose further down: the prose omits the account
 * window entirely and states the entry window only as descriptive rules text.
 *
 * Judge and steward registration get a card each and always share a window, so
 * the judge card stands in for both.
 */
const GLANCE_TITLES = {
  accountRegistration: ['account registration'],
  awardsCeremony: [],
  dropOff: ['entry drop-off', 'entry dropoff', 'drop-off'],
  entryAcceptanceRules: [],
  entryRegistration: ['entry registration'],
  shipping: ['entry shipping', 'shipping'],
  volunteerRegistration: ['judge registration', 'volunteer registration'],
} as const;

function parseGlanceDate(text: string): Date | undefined {
  // Cards state dates as "09/18/2026 5:00 PM, EDT".
  const match = /((?:\d{1,2}\/){2}\d{4} \d{1,2}:\d{2} [AP]M),\s*([A-Za-z]+)/.exec(text);
  if (!match) return undefined;

  const parsed = moment.tz(match[1], 'MM/DD/YYYY h:mm A', getGlanceTimezone(match[2]));
  return parsed.isValid() ? parsed.toDate() : undefined;
}

function getGlanceTimezone(abbreviation: string): string {
  const zones: { [key: string]: string } = {
    AKDT: 'America/Anchorage', AKST: 'America/Anchorage',
    CDT: 'America/Chicago', CST: 'America/Chicago',
    EDT: 'America/New_York', EST: 'America/New_York',
    HST: 'Pacific/Honolulu',
    MDT: 'America/Denver', MST: 'America/Denver',
    PDT: 'America/Los_Angeles', PST: 'America/Los_Angeles',
    UTC: 'Etc/UTC',
  };

  return zones[abbreviation.toUpperCase()] || moment.tz.guess();
}

/**
 * Reads the "At a Glance" cards, if the page has them.
 *
 * @param html the entry-info page source
 * @returns card title (lowercased) to window; empty on builds without the grid
 */
export function extractGlanceWindows(html: string): Map<string, GlanceWindow> {
  const $ = cheerio.load(html);
  const windows = new Map<string, GlanceWindow>();

  $('.glance-header').each((_index, element) => {
    const title = collapse($(element).text()).toLowerCase();
    if (!title) return;

    const body = $(element).closest('.glance-card-body');
    let open: Date | undefined;
    let close: Date | undefined;

    body.find('li').each((_i, item) => {
      const text = collapse($(item).text());
      const label = collapse($(item).find('strong').first().text()).toLowerCase();

      if (label === 'open' || label === 'start') open ??= parseGlanceDate(text);
      if (label === 'close' || label === 'end') close ??= parseGlanceDate(text);
    });

    if (!open && !close) return;

    const parts = [
      open ? `Open ${moment(open).format('dddd, MMMM D, YYYY h:mm A')}` : '',
      close ? `Close ${moment(close).format('dddd, MMMM D, YYYY h:mm A')}` : '',
    ].filter(Boolean);

    windows.set(title, { close, open, summary: parts.join(' \u2014 ') });
  });

  return windows;
}

/**
 * Finds the glance card backing a field.
 *
 * @param windows output of {@link extractGlanceWindows}
 * @param field the field to look up
 * @returns the window, or `undefined` when the build has no such card
 */
export function findGlanceWindow(windows: Map<string, GlanceWindow>, field: BcoemField): GlanceWindow | undefined {
  for (const title of GLANCE_TITLES[field]) {
    const match = windows.get(title);
    if (match) return match;
  }

  return undefined;
}
