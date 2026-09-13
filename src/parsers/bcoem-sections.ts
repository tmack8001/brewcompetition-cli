import cheerio from 'cheerio';

import { ShortDateOrder, detectShortDateOrder, formatInZone, parseTimestamps, resolveTimezone } from './bcoem-dates.js';

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
 * Matches only the status suffix newer builds append to a heading, as in
 * `Entry Registration is Open`.
 */
const STATUS_SUFFIX = String.raw`(?:\s+is\b.*)?`;

function headingPatterns(...labels: string[]): RegExp[] {
  return labels.map(label => new RegExp(`^${label}${STATUS_SUFFIX}$`, 'i'));
}

/**
 * Headings that introduce each field, from the English language pack in
 * `lang/en/en-US.lang.php`.
 *
 * Anchored at both ends. A loose prefix match would let admin-authored prose
 * hijack a field: competition rules are echoed verbatim and HTMLPurifier permits
 * heading tags, so a rules blurb containing `<h2>Shipping & Handling</h2>` would
 * otherwise outrank the real `Shipping Info` section - and the rules section is
 * rendered first.
 *
 * Two fields have more than one spelling. Drop-off is `Entry Delivery` for a
 * single location and `Drop-Off Locations` for several. Volunteer registration
 * only gets its own heading on newer builds; older ones fold it into the Account
 * Registration section as a second paragraph.
 */
const HEADING_PATTERNS = {
  accountRegistration: headingPatterns('account registration'),
  awardsCeremony: headingPatterns('awards ceremony'),
  dropOff: headingPatterns('drop-?off locations?', 'entry delivery'),
  entryAcceptanceRules: headingPatterns('entry acceptance rules'),
  entryRegistration: headingPatterns('entry registration'),
  shipping: headingPatterns('shipping info(?:rmation)?'),
  volunteerRegistration: headingPatterns(
    'judges? and stewards? registration',
    'judge registration',
    'volunteer registration'
  ),
} as const;

/**
 * Anchors the older builds emit, used as a fallback when heading matching comes
 * up empty.
 *
 * The public page is rendered by `pub/entry_info.pub.php`; the `sections/` tree
 * of the same name is reachable only through the admin-only `index.legacy.php`.
 * On the current public build `$anchor_name` is stale by the time these sections
 * render, so one anchor precedes several unrelated headings and this fallback is
 * inert there - it earns its place on the older render, which the fixtures pin.
 *
 * The anchor is the heading lowercased with spaces hyphenated, so it changes on a
 * translated install. `reg_window` is the one anchor BCOEM hardcodes.
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

/** Tags that carry part of a surrounding sentence rather than content of their own. */
const INLINE_TAGS = new Set(['a', 'b', 'code', 'em', 'i', 'small', 'span', 'strong', 'sub', 'sup', 'u']);

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
  // A <br> is a space, not nothing. Upstream puts one before the awards date, so
  // collapsing the element away glued the address to the venue name:
  // "Union Mills Homestead3311 Littlestown Pike".
  $('br').replaceWith(' ');

  const sections: BcoemSection[] = [];

  $('h2').each((_index, element) => {
    const text = collapse($(element).text());
    if (!text) return;

    const anchorEl = $(element).prevAll('a[name]').first();
    const anchor = anchorEl.length > 0 ? anchorEl.attr('name') : undefined;

    const paragraphs: string[] = [];
    let loose = '';

    const flushLoose = () => {
      const text = collapse(loose);
      if (text) paragraphs.push(text);
      loose = '';
    };

    // Walked by sibling rather than with nextUntil('h2') because that returns
    // elements only, and BCOEM does not always wrap a sentence in a <p>. When the
    // entrant window has closed but the judge window has not, the public page
    // emits "Registrations for <strong>judges and stewards only</strong> accepted
    // through <date>." with no wrapper at all - so an element-only walk loses the
    // judging deadline, and treating each text node separately would split that
    // sentence around its own <strong> and strand the cue from the date.
    for (let node = element.nextSibling; node; node = node.nextSibling) {
      if (node.type === 'tag' && node.name === 'h2') break;

      if (node.type === 'text') {
        loose += node.data ?? '';
        continue;
      }

      if (node.type !== 'tag') continue;

      const $sibling = $(node);
      const nested = $sibling.is('p') ? $sibling : $sibling.find('p');

      if (nested.length === 0) {
        // Inline markup carries part of the surrounding sentence. Block-level
        // elements with no paragraph of their own (tables, lists, nav) do not, and
        // absorbing their text would inject noise.
        if (INLINE_TAGS.has($sibling.prop('tagName')?.toLowerCase() ?? '')) {
          loose += ` ${$sibling.text()} `;
        }

        continue;
      }

      flushLoose();
      nested.each((_i, p) => {
        const paragraph = collapse($(p).text());
        if (paragraph) paragraphs.push(paragraph);
      });
    }

    flushLoose();

    sections.push({ anchor, heading: text, paragraphs });
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
 * Reads the paragraph of a field's section that states its window.
 *
 * The window sentence is not always the first paragraph - BCOEM renders it only
 * when the relevant deadline is set - so the first paragraph carrying a timestamp
 * wins, falling back to the first paragraph when none does.
 *
 * @param sections output of {@link extractSections}
 * @param field the field to read
 * @param order how this install orders `short` dates
 * @returns the paragraph text, or an empty string when the section is absent
 */
export function sectionWindowText(sections: BcoemSection[], field: BcoemField, order: ShortDateOrder): string {
  const section = findSection(sections, field);
  if (!section) return '';

  const dated = section.paragraphs.find(paragraph => parseTimestamps(paragraph, order).length > 0);

  return dated ?? section.paragraphs[0] ?? '';
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
 * The labelled form BCOEM emits when a bottle count is configured. Searched for
 * across the whole page, because this is the paragraph that detaches: it is
 * appended to the Entry Acceptance Rules body but outside the guard that renders
 * that section's heading, so on a closed competition it trails whichever section
 * came before.
 */
const BOTTLE_LABEL_EN = /\bnumber of bottles\b[^:]{0,60}:\s*\d{1,3}\s*$/i;

/**
 * The same paragraph's shape, for an install that words the label differently.
 *
 * The lookbehind keeps a clock out: `Ship bottles to arrive by 9/16 at 5:00` ends
 * in a colon followed by digits, but a time's colon always follows a digit and a
 * label's never does. It has to be a lookbehind rather than a consumed `\D`, or
 * the colon itself satisfies the non-digit and `Required bottles: 3` stops
 * matching.
 *
 * This still requires the English word "bottles", so a genuinely translated
 * install matches neither tier and the column is left empty. That is the honest
 * outcome - guessing from structure alone produced worse. Applied only within the
 * Entry Acceptance Rules section, because page-wide it outranked that section's
 * own prose using unrelated text from elsewhere: "Please bring bottles to the
 * drop-off. Entries per brewer: 5".
 */
const BOTTLE_LABEL_ANY = /\bbottles?\b[^:]{0,40}(?<!\d):\s*\d{1,3}\s*$/i;

/**
 * Finds the "number of bottles required per entry" paragraph.
 *
 * BCOEM appends this to the Entry Acceptance Rules body but outside the guard
 * that renders that section's heading, so on a competition whose drop-off and
 * shipping windows have both closed the paragraph detaches and trails whichever
 * section happened to come before it.
 *
 * The labelled form is searched for across the page first, then the
 * acceptance-rules prose. Scanning for a loose pattern instead let ordinary prose
 * that happens to end in a clock - "Ship bottles to arrive by 9/16 at 5:00" -
 * beat the real labelled value appearing later in the page.
 *
 * @param sections output of {@link extractSections}
 * @returns the paragraph text, or an empty string when absent
 */
export function findBottleRequirement(sections: BcoemSection[]): string {
  for (const section of sections) {
    const labelled = section.paragraphs.find(paragraph => BOTTLE_LABEL_EN.test(paragraph));
    if (labelled) return labelled;
  }

  const rules = findSection(sections, 'entryAcceptanceRules');
  if (!rules) return '';

  return rules.paragraphs.find(paragraph => BOTTLE_LABEL_ANY.test(paragraph))
    ?? rules.paragraphs[0]
    ?? '';
}

/** A window read from an "At a Glance" card. */
export interface GlanceWindow {
  close: Date | undefined;
  open: Date | undefined;
  /** Compact rendering of the card, for the human-readable column. */
  summary: string;
}

/**
 * Glance-card titles per field. Newer BCOEM builds lead the entry-info page with
 * an "At a Glance" grid stating each window as an explicit timestamp pair, which
 * is worth preferring for the *dates*: the prose on that build omits the account
 * window entirely and states the entry window only as descriptive rules text.
 *
 * Judge and steward registration get a card each and always share a window, so
 * the judge card stands in for both.
 */
const GLANCE_TITLES = {
  accountRegistration: ['account registration'],
  awardsCeremony: [],
  dropOff: ['entry drop-off', 'entry dropoff'],
  entryAcceptanceRules: [],
  entryRegistration: ['entry registration'],
  shipping: ['entry shipping'],
  volunteerRegistration: ['judge registration', 'volunteer registration'],
} as const;

function cardTimestamp(text: string, order: ShortDateOrder): { date: Date; zone: string } | undefined {
  const stamps = parseTimestamps(text, order);
  if (stamps.length === 0) return undefined;

  const zoneToken = /,\s*([A-Za-z]+|[+-]\d{2}(?::?\d{2})?)\s*$/.exec(text.trim());
  const zone = zoneToken ? resolveTimezone(zoneToken[1]) : undefined;

  return { date: stamps[0].date, zone: zone ?? 'UTC' };
}

/**
 * Reads the "At a Glance" cards, if the page has them.
 *
 * @param html the entry-info page source
 * @returns card title (lowercased) to window; empty on builds without the grid
 */
export function extractGlanceWindows(html: string): Map<string, GlanceWindow> {
  const $ = cheerio.load(html);
  const order = detectShortDateOrder(html);
  const windows = new Map<string, GlanceWindow>();

  $('.glance-header').each((_index, element) => {
    const title = collapse($(element).text()).toLowerCase();
    if (!title) return;

    const body = $(element).closest('.glance-card-body');
    let open: { date: Date; zone: string } | undefined;
    let close: { date: Date; zone: string } | undefined;

    body.find('li').each((_i, item) => {
      const text = collapse($(item).text());
      const label = collapse($(item).find('strong').first().text()).toLowerCase();

      if (label === 'open' || label === 'start') open ??= cardTimestamp(text, order);
      if (label === 'close' || label === 'end') close ??= cardTimestamp(text, order);
    });

    if (!open && !close) return;

    // Rendered in the competition's own zone, carrying the abbreviation. Using
    // the machine's zone made this column depend on where the CLI happened to run.
    const parts = [
      open ? `Open ${formatInZone(open.date, open.zone)}` : '',
      close ? `Close ${formatInZone(close.date, close.zone)}` : '',
    ].filter(Boolean);

    windows.set(title, { close: close?.date, open: open?.date, summary: parts.join(' — ') });
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
