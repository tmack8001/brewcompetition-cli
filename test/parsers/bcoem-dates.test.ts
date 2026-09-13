import { expect } from 'chai';
import moment from 'moment-timezone';

import { detectShortDateOrder, extractMoment, extractWindow, formatInZone, parseTimestamps, resolveTimezone } from '../../src/parsers/bcoem-dates.js';

describe('BCOEM date handling', () => {
  describe('Timezone resolution', () => {
    it('should resolve both standard and daylight abbreviations', () => {
      expect(resolveTimezone('EDT')).to.equal('America/New_York');
      expect(resolveTimezone('EST')).to.equal('America/New_York');
      expect(resolveTimezone('CDT')).to.equal('America/Chicago');
      expect(resolveTimezone('PDT')).to.equal('America/Los_Angeles');
    });

    it('should resolve a standard abbreviation to a zone that never leaves it', () => {
      // MST and CST denote fixed offsets. Resolving them to Denver and Chicago -
      // which upstream's ordering would - is right in winter and an hour wrong
      // every summer for Arizona and Saskatchewan competitions.
      expect(resolveTimezone('MST')).to.equal('America/Phoenix');
      expect(resolveTimezone('CST')).to.equal('America/Regina');

      const july = extractWindow('ceremony Friday, July 17, 2026 5:00 PM, MST');
      expect(july.start?.toISOString()).to.equal('2026-07-18T00:00:00.000Z');
    });

    it('should still resolve the daylight forms to the zones that emit them', () => {
      const july = extractWindow('ceremony Friday, July 17, 2026 5:00 PM, MDT');
      expect(july.start?.toISOString()).to.equal('2026-07-17T23:00:00.000Z');
    });

    it('should accept the two-digit numeric stamp PHP emits for many zones', () => {
      // `format('T')` yields a short numeric string for any zone whose tzdata
      // abbreviation is one - which covers Beijing, Bangkok, Sao Paulo, Buenos
      // Aires, Auckland and more. Requiring four digits dropped every date on
      // those pages while resolveTimezone already handled the form.
      for (const stamp of ['-03', '+08', '+07', '+11', '+12', '+13', '-05', '+04']) {
        expect(parseTimestamps(`Friday, August 14, 2026 5:00 PM, ${stamp}`), stamp).to.have.lengthOf(1);
      }

      expect(resolveTimezone('-03')).to.equal('-03:00');
    });

    it('should resolve the non-US zones BCOEM can render to the right offset', () => {
      // Upstream's offset table spans 46 zones; the abbreviation index is derived
      // from it rather than hand-listed. Asserting only that a string comes back
      // would pass for a zone with the wrong offset, so check the offset.
      const expected: [string, string, number][] = [
        ['AEDT', '2026-01-15', 660],
        ['AEST', '2026-07-15', 600],
        ['ACST', '2026-07-15', 570],
        ['AWST', '2026-07-15', 480],
        ['CEST', '2026-07-15', 120],
        ['CET', '2026-01-15', 60],
        ['IST', '2026-07-15', 330],
        ['KST', '2026-07-15', 540],
        ['MSK', '2026-07-15', 180],
        ['NST', '2026-01-15', -210],
        ['PKT', '2026-07-15', 300],
        ['SST', '2026-07-15', -660],
      ];

      for (const [abbreviation, day, offset] of expected) {
        const zone = resolveTimezone(abbreviation);
        expect(zone, abbreviation).to.be.a('string');
        expect(moment.tz(day, zone!).utcOffset(), abbreviation).to.equal(offset);
      }
    });

    it('should resolve the numeric offsets PHP emits for zones with no abbreviation', () => {
      expect(resolveTimezone('+0530')).to.equal('+05:30');
      expect(resolveTimezone('+11')).to.equal('+11:00');
      expect(resolveTimezone('-0930')).to.equal('-09:30');
    });

    it('should refuse an unknown abbreviation rather than guessing', () => {
      // Falling back to the host machine's zone turns an unknown stamp into a
      // confident, wrong instant - a Sydney competition read 15 hours out.
      expect(resolveTimezone('XYZ')).to.equal(undefined);
    });
  });

  describe('Rendered date formats', () => {
    const expected = { end: '2026-09-18T21:00:00.000Z', start: '2026-08-14T04:00:00.000Z' };

    // lib/date_time.lib.php composes date, time and zone independently, each from
    // an admin preference, so one pattern covers only one install's output.
    const renderings: [string, string][] = [
      ['US long, 12-hour', 'accepted Friday, August 14, 2026 12:00 AM, EDT — Friday, September 18, 2026 5:00 PM, EDT.'],
      ['international long, 12-hour', 'accepted Friday 14 August, 2026 12:00 AM, EDT — Friday 18 September, 2026 5:00 PM, EDT.'],
      ['US long, 24-hour', 'accepted Friday, August 14, 2026 00:00, EDT — Friday, September 18, 2026 17:00, EDT.'],
      ['US short', 'accepted 08/14/2026 12:00 AM, EDT — 09/18/2026 5:00 PM, EDT.'],
      // Not an upstream rendering: prefsDateFormat 999 emits Y-m-d H:i:s, but its
      // only caller asks for a zone-less format, so those timestamps carry no zone
      // and are ignored. Tolerated here so a hand-edited or future page still reads.
      ['a year-first numeric form', 'accepted 2026-08-14 00:00:00, EDT — 2026-09-18 17:00:00, EDT.'],
    ];

    for (const [name, text] of renderings) {
      it(`should read a window rendered as ${name}`, () => {
        const window = extractWindow(text, detectShortDateOrder(text));

        expect(window.start?.toISOString()).to.equal(expected.start);
        expect(window.end?.toISOString()).to.equal(expected.end);
      });
    }

    it('should treat midnight as midnight', () => {
      const window = extractWindow('accepted Friday, August 14, 2026 12:00 AM, EDT.');

      expect(window.start?.toISOString()).to.equal('2026-08-14T04:00:00.000Z');
    });

    it('should not let a mismatched weekday invalidate the date', () => {
      // August 8 2026 is a Saturday. Parsing the weekday gained nothing and made
      // any translated, abbreviated or simply wrong day name fail the whole parse.
      const window = extractWindow('ceremony Monday, August 8, 2026 5:00 PM, EDT');

      expect(window.start?.toISOString()).to.equal('2026-08-08T21:00:00.000Z');
    });
  });

  describe('Short date ordering', () => {
    it('should read day-first ordering off the page', () => {
      expect(detectShortDateOrder('open 18/09/2026 5:00 PM, CET')).to.equal('DMY');
    });

    it('should read year-first ordering off the page', () => {
      expect(detectShortDateOrder('open 2026-09-18 17:00:00, CET')).to.equal('YMD');
    });

    it('should default to US ordering when the page is ambiguous', () => {
      expect(detectShortDateOrder('open 05/09/2026 5:00 PM, EDT')).to.equal('MDY');
    });

    it('should ignore dates outside a rendered timestamp', () => {
      // An ISO-looking timestamp in an inline script declared whole pages
      // year-first, after which every card date parsed as a different year.
      const html = '<script>var built="2026-09-08";</script> open 06/10/2026 12:00 AM, EDT';

      expect(detectShortDateOrder(html)).to.equal('MDY');
    });

    it('should place a day-first date correctly once the page settles the order', () => {
      const text = 'accepted 05/09/2026 12:00 AM, CET — 18/09/2026 5:00 PM, CET.';
      const window = extractWindow(text, detectShortDateOrder(text));

      // 5 September, not 9 May.
      expect(window.start?.toISOString()).to.equal('2026-09-04T22:00:00.000Z');
    });
  });

  describe('One-sided windows', () => {
    it('should put a close-only timestamp in the end slot', () => {
      // BCOEM renders the sentence whenever the deadline is set, so a window with
      // no opening date still gets one timestamp. Positionally it looked like a start.
      const window = extractWindow('accepted at our shipping location through Friday, September 18, 2026 5:00 PM, EDT.');

      expect(window.start).to.equal(undefined);
      expect(window.end?.toISOString()).to.equal('2026-09-18T21:00:00.000Z');
    });

    it('should put an open-only timestamp in the start slot', () => {
      const window = extractWindow('You will be able to add your entries beginning Friday, August 14, 2026 12:00 AM, EDT.');

      expect(window.start?.toISOString()).to.equal('2026-08-14T04:00:00.000Z');
      expect(window.end).to.equal(undefined);
    });

    // Upstream replaces the opening timestamp with "today" or "now" once a window
    // is open, so these sentences state only the deadline. Treating those words as
    // opening cues put the close in the start column for every competition
    // currently taking entries.
    const openStateSentences: [string, string][] = [
      ['account registration', 'You can create your account today through Friday, May 2, 2025 11:59 PM, EDT.'],
      ['volunteer registration', 'Judges and stewards may register now through Monday, June 2, 2025 5:00 PM, EDT.'],
      ['entry registration', 'You can add your entries to the system today through Friday, May 2, 2025 11:59 PM, EDT.'],
      ['entries already open', 'Entries are now being accepted and must arrive no later than Friday, May 2, 2025 11:59 PM, EDT.'],
      ['all brewers', 'Entries from all brewers accepted through Friday, May 2, 2025 11:59 PM, EDT.'],
    ];

    for (const [name, text] of openStateSentences) {
      it(`should read the lone date as the deadline for an open ${name} window`, () => {
        const window = extractWindow(text);

        expect(window.end, 'end').to.not.equal(undefined);
        expect(window.start, 'start').to.equal(undefined);
      });
    }

    it('should still pair two dates when the prose also contains the word today', () => {
      const window = extractWindow(
        'Register today! Entries accepted Friday, August 14, 2026 12:00 AM, EDT — Friday, September 18, 2026 5:00 PM, EDT.'
      );

      expect(window.start?.toISOString()).to.equal('2026-08-14T04:00:00.000Z');
      expect(window.end?.toISOString()).to.equal('2026-09-18T21:00:00.000Z');
    });

    it('should never emit an inverted window', () => {
      const window = extractWindow(
        'closed Friday, September 18, 2026 5:00 PM, EDT after opening Friday, August 14, 2026 12:00 AM, EDT.'
      );

      expect(window.start!.getTime()).to.be.lessThan(window.end!.getTime());
    });
  });

  describe('Formatting for the readable column', () => {
    it('should render a fixed offset in that offset, not the host timezone', () => {
      // A fixed offset is not a moment-timezone zone: passing one to .tz() logs a
      // warning and silently leaves the moment in the host's zone, rolling the
      // clock and sometimes the date. Nineteen of the zones BCOEM supports have no
      // lettered abbreviation, so this is the common path.
      const instant = new Date('2026-09-18T20:00:00.000Z');

      expect(formatInZone(instant, '-03:00')).to.equal('Friday, September 18, 2026 5:00 PM, UTC-03:00');
      expect(formatInZone(instant, '+05:30')).to.equal('Saturday, September 19, 2026 1:30 AM, UTC+05:30');
    });

    it('should render a named zone with its abbreviation', () => {
      const instant = new Date('2026-09-18T21:00:00.000Z');

      expect(formatInZone(instant, 'America/New_York')).to.equal('Friday, September 18, 2026 5:00 PM, EDT');
    });
  });

  describe('Moments rather than windows', () => {
    it('should ignore cue words in admin free-text for a bare moment', () => {
      // The awards ceremony shares its paragraph with the venue name and address,
      // and real venues contain cue words: "Deadline Brewing Parlor".
      for (const venue of ['Union Mills Homestead', 'Deadline Brewing Parlor', 'Brewery by the Bay']) {
        const moment_ = extractMoment(`${venue} 123 Main St Saturday, September 26, 2026 5:00 PM, EDT`);

        expect(moment_.start?.toISOString(), venue).to.equal('2026-09-26T21:00:00.000Z');
        expect(moment_.end, venue).to.equal(undefined);
      }
    });
  });

  describe('Every date-bearing sentence the public page renders', () => {
    // Enumerated from the sprintf calls in pub/entry_info.pub.php that take a
    // date argument, with the English strings from lang/en/en-US.lang.php. Each is
    // labelled by its line number upstream so it can be re-checked against a
    // future release.
    const OPEN = 'Friday, August 14, 2026 12:00 AM, EDT';
    const CLOSE = 'Friday, September 18, 2026 5:00 PM, EDT';
    const OPEN_ISO = '2026-08-14T04:00:00.000Z';
    const CLOSE_ISO = '2026-09-18T21:00:00.000Z';

    const sentences: [string, string, string | undefined, string | undefined][] = [
      ['128 account, not yet open', `You will be able to create your account beginning ${OPEN} through ${CLOSE}.`, OPEN_ISO, CLOSE_ISO],
      ['128 judges, not yet open', `Judges and stewards may register beginning ${OPEN} through ${CLOSE}.`, OPEN_ISO, CLOSE_ISO],
      ['129 account, open', `You can create your account today through ${CLOSE}.`, undefined, CLOSE_ISO],
      ['129 judges, open', `Judges and stewards may register now through ${CLOSE}.`, undefined, CLOSE_ISO],
      ['130 judges only, unwrapped', `Registrations for judges and stewards only accepted through ${CLOSE}.`, undefined, CLOSE_ISO],
      ['140 entries, not yet open', `You will be able to add your entries to the system beginning ${OPEN} through ${CLOSE}.`, OPEN_ISO, CLOSE_ISO],
      ['141 entries, open', `You can add your entries to the system today through ${CLOSE}.`, undefined, CLOSE_ISO],
      ['533 shipping, both bounds', `Entry bottles accepted at our shipping location ${OPEN} — ${CLOSE}.`, OPEN_ISO, CLOSE_ISO],
      ['533 shipping, deadline only', `Entry bottles accepted at our shipping location  through ${CLOSE}.`, undefined, CLOSE_ISO],
      ['571 drop-off, both bounds', `Entry bottles accepted at our drop-off locations ${OPEN} — ${CLOSE}.`, OPEN_ISO, CLOSE_ISO],
      ['571 drop-off, deadline only', `Entry bottles accepted at our drop-off locations  through ${CLOSE}.`, undefined, CLOSE_ISO],
      ['awards ceremony, bare moment', `Union Mills Homestead 3311 Littlestown Pike ${CLOSE}`, CLOSE_ISO, undefined],
    ];

    for (const [name, text, start, end] of sentences) {
      it(`should read ${name}`, () => {
        const window = extractWindow(text);

        expect(window.start?.toISOString(), 'start').to.equal(start);
        expect(window.end?.toISOString(), 'end').to.equal(end);
      });
    }
  });

  it('should find no timestamps in text that states none', () => {
    expect(parseTimestamps('Registration is closed.')).to.deep.equal([]);
  });
});
