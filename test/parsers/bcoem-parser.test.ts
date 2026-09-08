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

    it('should fall back to anchors when a heading does not match', () => {
      // The anchor build is English here, so headings match. This asserts the
      // fallback path still resolves the same section.
      const sections = extractSections(fixture('bcoem_info.html'));
      const byAnchor = sections.find(section => section.anchor === 'reg_window');

      expect(byAnchor?.heading).to.equal('Account Registration');
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
