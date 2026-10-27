import { expect } from 'chai';

import { normalizeForMatch, shouldIncludeEntry, wantedBrewers } from '../../src/parsers/filters.js';

describe('Result filters', () => {
  describe('normalizeForMatch', () => {
    /**
     * Builds a string from text and code points, so the case under test is
     * unambiguous in source (no literal combining marks or odd spaces).
     *
     * @param parts text, or code points
     * @returns the joined string
     */
    const u = (...parts: Array<number | string>): string => parts.map(part => (typeof part === 'number' ? String.fromCodePoint(part) : part)).join('');

    const cases: Array<[string, string, string]> = [
      ['plain umlaut, case and spacing', '  The  BR\u00DC Club ', 'the bru club'],
      ['precomposed u-umlaut', u('Br', 0xfc), 'bru'],
      ['decomposed u-umlaut', u('Bru', 0x3_08), 'bru'],
      ['cedilla, precomposed', u('Fran', 0xe7, 'ois'), 'francois'],
      ['cedilla, combining U+0327', u('Franc', 0x3_27, 'ois'), 'francois'],
      ['sharp s', u('Stra', 0xdf, 'e'), 'strasse'],
      ['o with stroke', u('Br', 0xf8), 'bro'],
      ['ae ligature', u(0xe6, 'le'), 'aele'],
      ['l with stroke', u(0x1_42, 'od', 0xfa), 'lodu'],
      ['d with stroke', u(0x1_11, 'ab'), 'dab'],
      ['oe ligature', u(0x1_53, 'uvre'), 'oeuvre'],
      ['eth', u('Gu', 0xf0, 'rum'), 'gudrum'],
      ['thorn', u(0xfe, 'or'), 'thor'],
      ['capital O with stroke and acute', u(0x1_fe, 'l'), 'ol'],
      ['capital AE with acute', u(0x1_fc, 'le'), 'aele'],
      ['capital sharp s', u(0x1e_9e), 'ss'],
      ['dotted capital I', u(0x1_30, 'pa'), 'ipa'],
      ['fi ligature (compatibility)', u(0xfb_01, 'ne'), 'fine'],
      ['full-width letters (compatibility)', u(0xff_22, 0xff_52, 0xfc), 'bru'],
      ['right single quote', u('Brewer', 0x20_19, 's'), "brewer's"],
      ['left single quote', u('Brewer', 0x20_18, 's'), "brewer's"],
      ['modifier apostrophe', u('Brewer', 0x2_bc, 's'), "brewer's"],
      ['acute accent as apostrophe', u('Brewer', 0xb4, 's'), "brewer's"],
      ['single high-reversed-9 quote', u('D', 0x20_1b, 'Arcy'), "d'arcy"],
      ['prime', u('D', 0x20_32, 'Arcy'), "d'arcy"],
      ['grave accent as apostrophe', 'Brewer`s', "brewer's"],
      ['straight apostrophe', "Brewer's", "brewer's"],
      ['hyphen U+2010', u('A', 0x20_10, 'B'), 'a-b'],
      ['horizontal bar', u('A', 0x20_15, 'B'), 'a-b'],
      ['small em dash (compatibility)', u('A', 0xfe_58, 'B'), 'a-b'],
      ['en dash', u('A ', 0x20_13, ' B'), 'a - b'],
      ['em dash', u('A ', 0x20_14, ' B'), 'a - b'],
      ['non-breaking hyphen', u('A', 0x20_11, 'B'), 'a-b'],
      ['minus sign', u('A ', 0x22_12, ' B'), 'a - b'],
      ['hyphen', 'A - B', 'a - b'],
      ['character just below the dash range', u('A', 0x20_0f, 'B'), u('a', 0x20_0f, 'b')],
      ['character just above the dash range', u('A', 0x20_16, 'B'), u('a', 0x20_16, 'b')],
      ['tab between words', 'The\tBru\t\tClub', 'the bru club'],
      ['newline between words', 'The\n Bru Club', 'the bru club'],
      ['non-breaking space', u('The', 0xa0, 'Bru', 0xa0, 0xa0, 'Club'), 'the bru club'],
      ['em space', u('The', 0x20_03, 'Bru Club'), 'the bru club'],
      ['Mc mark (Devanagari vowel sign aa)', u(0x9_15, 0x9_3e), u(0x9_15)],
      ['Me mark (enclosing circle)', u('a', 0x20_dd), 'a'],
      ['only combining marks', u(0x3_01, 0x3_27), ''],
      ['only whitespace', u(' ', 0xa0, '\t'), ''],
    ];

    for (const [name, input, expected] of cases) {
      it(`normalizes ${name}`, () => {
        expect(normalizeForMatch(input)).to.equal(expected);
      });
    }

    it('gives precomposed and decomposed spellings the same key', () => {
      expect(normalizeForMatch(u('Br', 0xfc))).to.equal(normalizeForMatch(u('Bru', 0x3_08)));
    });

    it('leaves zero-width space and soft hyphen in place (documented limit)', () => {
      expect(normalizeForMatch(u('Br', 0x20_0b, 'u'))).to.equal(u('br', 0x20_0b, 'u'));
      expect(normalizeForMatch(u('Br', 0xad, 'u'))).to.equal(u('br', 0xad, 'u'));
    });
  });

  describe('wantedBrewers', () => {
    it('splits on commas, normalizes each name and drops blank ones', () => {
      expect(wantedBrewers(' Zoë  Smith , ,Ørjan,')).to.deep.equal(['zoe smith', 'orjan']);
      expect(wantedBrewers(' , ')).to.deep.equal([]);
    });
  });

  describe('shouldIncludeEntry', () => {
    const none = { brewers: undefined, club: undefined };

    it('includes everything when no filter is set', () => {
      expect(shouldIncludeEntry('Anyone', 'Any Club', none)).to.equal(true);
    });

    it('matches the club in both spellings, in both directions', () => {
      expect(shouldIncludeEntry('A', 'The Brü Club', { ...none, club: 'The Bru Club' })).to.equal(true);
      expect(shouldIncludeEntry('A', 'The Bru Club', { ...none, club: 'The Brü Club' })).to.equal(true);
    });

    it('does not match a different club', () => {
      expect(shouldIncludeEntry('A', 'The Brü Club', { ...none, club: 'Other Club' })).to.equal(false);
    });

    it('splits the brewers list on a bare comma', () => {
      expect(shouldIncludeEntry('Jose Nunez', '', { ...none, brewers: 'Ann Lee,Jose Nunez' })).to.equal(true);
    });

    it('does not match a club suffix', () => {
      expect(shouldIncludeEntry('A', 'The Bru Club', { ...none, club: 'Bru Club' })).to.equal(false);
    });

    it('keeps whole-value matching, not substring', () => {
      expect(shouldIncludeEntry('A', 'The Brü Club', { ...none, club: 'Bru' })).to.equal(false);
      expect(shouldIncludeEntry('A', 'Bru', { ...none, club: 'The Bru Club' })).to.equal(false);
    });

    it('matches accent-bearing brewer names in a comma list', () => {
      expect(shouldIncludeEntry('José Núñez', '', { ...none, brewers: 'Ann Lee, Jose Nunez' })).to.equal(true);
      expect(shouldIncludeEntry('Jose Nunez', '', { ...none, brewers: 'José Núñez' })).to.equal(true);
      expect(shouldIncludeEntry('Jose Nunez', '', { ...none, brewers: 'José' })).to.equal(false);
    });

    it('never matches an empty club with a blank club filter', () => {
      expect(shouldIncludeEntry('A', '', { ...none, club: ' ' })).to.equal(false);
      expect(shouldIncludeEntry('A', '', { ...none, club: '\u0301' })).to.equal(false);
    });

    it('never matches an empty brewer with blank brewers entries', () => {
      expect(shouldIncludeEntry('', 'X', { ...none, brewers: 'Ann Lee,' })).to.equal(false);
      expect(shouldIncludeEntry('', 'X', { ...none, brewers: ' , ' })).to.equal(false);
    });

    it('keeps a blank club filter from widening a brewers match', () => {
      const filters = { brewers: 'Ann Lee', club: ' ' };
      expect(shouldIncludeEntry('Bob', '', filters)).to.equal(false);
      expect(shouldIncludeEntry('Ann Lee', '', filters)).to.equal(true);
    });

    it('includes an entry matching either the brewer or the club', () => {
      const filters = { brewers: 'Ann Lee', club: 'The Bru Club' };
      expect(shouldIncludeEntry('Ann Lee', 'Elsewhere', filters)).to.equal(true);
      expect(shouldIncludeEntry('Bob', 'The Brü Club', filters)).to.equal(true);
      expect(shouldIncludeEntry('Bob', 'Elsewhere', filters)).to.equal(false);
    });
  });
});
