import { expect } from 'chai';
import fs from 'node:fs';
import path from 'node:path';

import { BCOEMParser } from '../../src/parsers/bcoem-parser.js';
import { extractGlanceWindows, extractSections, findSection } from '../../src/parsers/bcoem-sections.js';

function fixture(name: string): string {
  return fs.readFileSync(path.join('test', 'resources', 'metadata', name), 'utf8');
}

/**
 * Reads a parsed row back into a lookup, so assertions can name a column instead
 * of counting pipes.
 *
 * @param result the parsed metadata
 * @returns column name to value
 */
function asRecord(result: { data: string; header: string }): Record<string, string> {
  const headers = result.header.split('|');
  const values = result.data.split('|');

  return Object.fromEntries(headers.map((key, index) => [key, values[index] ?? '']));
}

describe('BCOEM Parser', () => {
  const parser = new BCOEMParser();

  describe('Anchor build, competition closed (bcoem_info.html)', () => {
    it('should read the registration windows', async () => {
      const row = asRecord(await parser.parseMetadata(fixture('bcoem_info.html')));

      expect(row.entrant_registration).to.equal('Registration is closed.');
      expect(row.entry_registration).to.equal('Entry registration is closed.');
    });

    it('should not leak the next section into a short one', async () => {
      // Account Registration renders one paragraph when closed and two when
      // open. The old nextAll('p') walk pulled Entry Registration's paragraph in
      // as the volunteer window whenever it was short.
      const row = asRecord(await parser.parseMetadata(fixture('bcoem_info.html')));

      expect(row.volunteer_registration).to.not.equal('Entry registration is closed.');
    });

    it('should find the bottle requirement even though its heading is gone', async () => {
      const row = asRecord(await parser.parseMetadata(fixture('bcoem_info.html')));

      expect(row.num_required).to.match(/Number of Bottles Required Per Entry:\s*\d+/);
    });

    it('should not throw when a section states no dates', async () => {
      // "Registration is closed." carries no window. The parse used to abort the
      // whole page on the first such section.
      const result = await parser.parseMetadata(fixture('bcoem_info.html'));

      expect(result.data).to.be.a('string');
    });
  });

  describe('Anchor build, competition closed (bcoem_info_closed.html)', () => {
    it('should read the awards ceremony date', async () => {
      const row = asRecord(await parser.parseMetadata(fixture('bcoem_info_closed.html')));

      expect(row.awards_ceremony).to.contain('Saturday, August 8, 2026 5:00 PM, EDT');
      expect(new Date(row.awards_ceremony_start_date).toISOString()).to.equal('2026-08-08T21:00:00.000Z');
    });
  });

  describe('Landing-page build, competition open (bcoem_info_landing.html)', () => {
    it('should read every window from the At a Glance cards', async () => {
      const row = asRecord(await parser.parseMetadata(fixture('bcoem_info_landing.html')));

      expect(new Date(row.entrant_registration_start_date).toISOString()).to.equal('2026-06-10T04:00:00.000Z');
      expect(new Date(row.entrant_registration_end_date).toISOString()).to.equal('2026-09-18T17:00:00.000Z');
      expect(new Date(row.entry_registration_start_date).toISOString()).to.equal('2026-07-04T14:00:00.000Z');
      expect(new Date(row.entry_registration_end_date).toISOString()).to.equal('2026-09-18T21:00:00.000Z');
      expect(new Date(row.volunteer_registration_end_date).toISOString()).to.equal('2026-09-25T17:00:00.000Z');
    });

    it('should read the drop-off and shipping windows a closed competition omits', async () => {
      const row = asRecord(await parser.parseMetadata(fixture('bcoem_info_landing.html')));

      expect(new Date(row.drop_off_window_start_date).toISOString()).to.equal('2026-08-14T04:00:00.000Z');
      expect(new Date(row.drop_off_window_end_date).toISOString()).to.equal('2026-09-18T21:00:00.000Z');
      expect(new Date(row.shipping_window_start_date).toISOString()).to.equal('2026-08-14T04:00:00.000Z');
      expect(new Date(row.shipping_window_end_date).toISOString()).to.equal('2026-09-18T21:00:00.000Z');
    });

    it('should treat midnight as midnight', async () => {
      // "12:00 AM" parsed with an HH format silently became midday, putting every
      // window that opens at midnight twelve hours late.
      const row = asRecord(await parser.parseMetadata(fixture('bcoem_info_landing.html')));

      expect(new Date(row.drop_off_window_start_date).getUTCHours()).to.equal(4); // 00:00 EDT
    });

    it('should keep the drop-off locations and shipping address, not just the dates', async () => {
      // Preferring the glance summary for the text column threw these away and
      // left drop_off_window and shipping_window byte-identical.
      const row = asRecord(await parser.parseMetadata(fixture('bcoem_info_landing.html')));

      expect(row.drop_off_window).to.contain('drop-off locations');
      expect(row.shipping_window).to.contain('shipping location');
      expect(row.drop_off_window).to.not.equal(row.shipping_window);
    });

    it('should emit dates as ISO-8601 so they do not depend on the host timezone', async () => {
      const row = asRecord(await parser.parseMetadata(fixture('bcoem_info_landing.html')));

      expect(row.drop_off_window_start_date).to.equal('2026-08-14T04:00:00.000Z');
    });

    it('should read the bottle requirement from the acceptance rules prose', async () => {
      // This build states no "Number of Bottles Required Per Entry: N" line, so
      // the acceptance-rules paragraph is the answer - not the drop-off sentence,
      // whose clock also contains a colon followed by digits.
      const row = asRecord(await parser.parseMetadata(fixture('bcoem_info_landing.html')));

      expect(row.num_required).to.contain('bottles or cans');
      expect(row.num_required).to.not.contain('drop-off locations');
    });
  });

  describe('Section extraction', () => {
    it('should match a heading that carries an inline status', () => {
      const sections = extractSections(fixture('bcoem_info_landing.html'));
      const entry = findSection(sections, 'entryRegistration');

      expect(entry?.heading).to.match(/^Entry Registration is/);
    });

    it('should fall back to the anchor when the heading is not English', () => {
      // The real reason the anchor fallback exists. The heading patterns are
      // English, so a translated install can only be resolved by the anchor -
      // which BCOEM derives from the same translated label, meaning this works
      // only for a page whose anchors happen to be the English slugs.
      const html =
        '<html><body><a class="anchor-offset" name="shipping-info"></a><h2>Zasílání poštou</h2>' +
        '<p>accepted Friday, August 14, 2026 12:00 AM, EDT — Friday, September 18, 2026 5:00 PM, EDT.</p></body></html>';

      expect(findSection(extractSections(html), 'shipping')?.heading).to.equal('Zasílání poštou');
    });

    it('should resolve an English anchor-build section by heading', () => {
      const sections = extractSections(fixture('bcoem_info.html'));

      expect(findSection(sections, 'accountRegistration')?.heading).to.equal('Account Registration');
    });

    it('should ignore the duplicated anchors the landing build emits', () => {
      // Drop-Off Locations, Shipping Info and Awards Ceremony are all preceded by
      // name="judging-sessions" on this build, so anchors cannot disambiguate.
      const sections = extractSections(fixture('bcoem_info_landing.html'));

      expect(findSection(sections, 'dropOff')?.heading).to.equal('Drop-Off Locations');
      expect(findSection(sections, 'shipping')?.heading).to.equal('Shipping Info');
      expect(findSection(sections, 'awardsCeremony')?.heading).to.equal('Awards Ceremony');
    });
  });

  describe('At a Glance cards', () => {
    it('should be absent on the anchor build', () => {
      expect(extractGlanceWindows(fixture('bcoem_info.html')).size).to.equal(0);
    });

    it('should expose one window per card on the landing build', () => {
      const windows = extractGlanceWindows(fixture('bcoem_info_landing.html'));

      expect([...windows.keys()]).to.include.members([
        'account registration',
        'entry registration',
        'judge registration',
        'entry drop-off',
        'entry shipping',
      ]);
    });
  });

  describe('Metadata URL discovery', () => {
    it('should offer the entry-info page alongside the given URL', () => {
      expect(parser.metadataUrls('https://example.org/index.php')).to.deep.equal([
        'https://example.org/index.php',
        'https://example.org/index.php?section=entry',
      ]);
    });

    it('should leave a URL that already names a section alone', () => {
      expect(parser.metadataUrls('https://example.org/index.php?section=rules')).to.deep.equal([
        'https://example.org/index.php?section=rules',
      ]);
    });
  });
});

describe('BCOEM Parser, international anchor build with open windows', () => {
  const parser = new BCOEMParser();

  it('should fill every window from day-first, 24-hour prose', async () => {
    // The configuration that previously produced nothing: prefsDateFormat other
    // than 1, prefsTimeFormat 1, and a European zone.
    const row = asRecord(await parser.parseMetadata(fixture('bcoem_info_intl_open.html')));

    expect(row.entrant_registration_start_date).to.equal('2026-06-08T07:00:00.000Z');
    expect(row.entrant_registration_end_date).to.equal('2026-09-18T15:00:00.000Z');
    expect(row.entry_registration_start_date).to.equal('2026-07-04T08:00:00.000Z');
    expect(row.shipping_window_start_date).to.equal('2026-08-13T22:00:00.000Z');
    expect(row.awards_ceremony_start_date).to.equal('2026-10-03T16:00:00.000Z');
  });

  it('should read volunteer registration from the account section second paragraph', async () => {
    // Older builds give judge and steward registration no heading of its own.
    const row = asRecord(await parser.parseMetadata(fixture('bcoem_info_intl_open.html')));

    expect(row.volunteer_registration).to.contain('Judges and stewards');
    expect(row.volunteer_registration_end_date).to.equal('2026-09-25T15:00:00.000Z');
  });

  it('should find drop-off when a single location makes the heading Entry Delivery', async () => {
    const row = asRecord(await parser.parseMetadata(fixture('bcoem_info_intl_open.html')));

    expect(row.drop_off_window).to.contain('drop-off locations');
    expect(row.drop_off_window_end_date).to.equal('2026-09-18T15:00:00.000Z');
  });
});

/**
 * Wraps a fragment in a minimal document.
 *
 * @param body the fragment
 * @returns the document source
 */
function page(body: string): string {
  return `<html><body>${body}</body></html>`;
}

describe('BCOEM Parser, hostile input', () => {
  const parser = new BCOEMParser();

  it('should keep the row aligned when admin text contains a pipe', async () => {
    // These fields are admin free-text, stored and echoed verbatim; a pipe in one
    // shifted every later column and desynchronised the row from its header.
    const html = page(
      '<a name="entry-acceptance-rules"></a><h2>Entry Acceptance Rules</h2>' +
        '<p>Bottles must be 12oz | 16oz | 22oz. Number of Bottles Required Per Entry: 2</p>' +
        '<a name="awards-ceremony"></a><h2>Awards Ceremony</h2>' +
        '<p>Online Saturday, August 8, 2026 5:00 PM, EDT</p>'
    );
    const result = await parser.parseMetadata(html);

    expect(result.data.split('|')).to.have.lengthOf(result.header.split('|').length);
    expect(asRecord(result).num_required).to.contain('Number of Bottles Required Per Entry: 2');
  });

  it('should not let an admin-authored heading hijack a field', async () => {
    // HTMLPurifier permits heading tags in the rules blurb, and the rules section
    // renders before the entry-info one.
    const html = page(
      '<h2>Shipping &amp; Handling</h2><p>Add $5 per entry for shipping.</p>' +
        '<a name="shipping-info"></a><h2>Shipping Info</h2>' +
        '<p>accepted Friday, August 14, 2026 12:00 AM, EDT — Friday, September 18, 2026 5:00 PM, EDT.</p>'
    );
    const row = asRecord(await parser.parseMetadata(html));

    expect(row.shipping_window).to.contain('accepted');
    expect(row.shipping_window_start_date).to.equal('2026-08-14T04:00:00.000Z');
  });

  it('should read a window rendered as a bare text node with no wrapper', async () => {
    // The older render emits the judges-and-stewards sentence unwrapped, which an
    // element-only sibling walk drops - losing both registration windows.
    const html = page(
      '<a name="reg_window"></a><h2>Account Registration</h2>' +
        'You can create your account today through Friday, May 2, 2026 11:59 PM, EDT.' +
        '<a name="entry-registration"></a><h2>Entry Registration</h2><p>Entry registration is closed.</p>'
    );
    const row = asRecord(await parser.parseMetadata(html));

    expect(row.entrant_registration).to.contain('create your account');
    expect(row.entrant_registration_end_date).to.equal('2026-05-03T03:59:00.000Z');
  });

  it('should keep an unwrapped sentence whole across its own inline markup', async () => {
    // When the entrant window has closed but the judge window has not, upstream
    // emits this with no <p> and a <strong> mid-sentence. Splitting on the strong
    // would strand the "through" cue from the date and flip it to a start.
    const html = page(
      '<a name="reg_window"></a><h2>Account Registration</h2>' +
        'Registrations for <strong>judges and stewards only</strong> accepted through Saturday, September 26, 2026 5:00 PM, EDT.'
    );
    const row = asRecord(await parser.parseMetadata(html));

    expect(row.entrant_registration).to.contain('judges and stewards only accepted through');
    expect(row.entrant_registration_end_date).to.equal('2026-09-26T21:00:00.000Z');
    expect(row.entrant_registration_start_date).to.equal('');
  });

  it('should turn a line break into a space rather than gluing words together', async () => {
    const html = page(
      '<a name="awards-ceremony"></a><h2>Awards Ceremony</h2>' +
        '<p>Union Mills Homestead<br />3311 Littlestown Pike<br />Saturday, September 26, 2026 5:00 PM, EDT</p>'
    );

    expect(asRecord(await parser.parseMetadata(html)).awards_ceremony).to.contain('Homestead 3311');
  });

  it('should prefer the labelled bottle count over prose that ends in a clock', async () => {
    // A time's colon always follows a digit; a label's never does.
    const html = page(
      '<h2>Entry Delivery</h2><p>Ship bottles to arrive by 9/16 at 5:00</p>' +
        '<a name="entry-acceptance-rules"></a><h2>Entry Acceptance Rules</h2>' +
        '<p>Number of Bottles Required Per Entry: 3</p>'
    );

    expect(asRecord(await parser.parseMetadata(html)).num_required).to.contain('Per Entry: 3');
  });
});
