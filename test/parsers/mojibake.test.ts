import { expect } from 'chai';

import { repairMojibake } from '../../src/parsers/mojibake.js';

/**
 * Builds a string from text and code points, so each character under test is unambiguous in source.
 *
 * @param parts text, or code points
 * @returns the joined string
 */
const u = (...parts: Array<number | string>): string => parts.map(part => (typeof part === 'number' ? String.fromCodePoint(part) : part)).join('');

describe('repairMojibake', () => {
  const repaired: Array<[string, string, string]> = [
    ['curly double quotes (as published by Reggie)', u('Randall ', 0xe2, 0x20_ac, 0x1_53, 'Scott', 0xe2, 0x20_ac, 0x9d, ' Gordon'), 'Randall “Scott” Gordon'],
    ['right single quote', u('Motor Boatin', 0xe2, 0x20_ac, 0x21_22), 'Motor Boatin’'],
    ['A with grave and euro-sign bytes', u(0xc3, 0x20_ac, ' La Cart'), 'À La Cart'],
    ['u with umlaut', u('Br', 0xc3, 0xbc, ' Club'), 'Brü Club'],
    ['a trailing no-break-space byte is kept (it is not whitespace to strip)', u('caf', 0xc3, 0xa0), 'cafà'],
    ['en dash', u('A ', 0xe2, 0x20_ac, 0x20_1c, ' B'), 'A – B'],
    ['four-byte emoji', u('Hop ', 0xf0, 0x1_78, 0x8d, 0xba), 'Hop 🍺'],
    ['an unrepairable character beside a repairable one', u(0xc3, 0xbc, 0x1_00), 'ü\u0100'],
    ['two separate runs', u('Br', 0xc3, 0xbc, ' and Ren', 0xc3, 0xa9), 'Brü and René'],
  ];

  for (const [name, input, expected] of repaired) {
    it(`repairs ${name}`, () => {
      expect(repairMojibake(input)).to.equal(expected);
    });
  }

  const untouched: Array<[string, string]> = [
    ['plain ASCII', 'Randall Scott Gordon'],
    ['an empty string', ''],
    ['a correct u with umlaut', u('Br', 0xfc, ' Club')],
    ['correct curly quotes', 'Randall “Scott” Gordon'],
    ['a correct right single quote', 'Motor Boatin’'],
    ['a truncated sequence (lead byte alone)', u('Br', 0xc3)],
    ['a continuation byte alone', u('a', 0xbc)],
    ['a character Windows-1252 cannot encode', u('Ba', 0x1_00, 'bi')],
    ['an overlong two-byte sequence', u(0xc1, 0xbf)],
    ['a lead byte followed by a character outside a sequence', u(0xc3, 'x')],
  ];

  for (const [name, input] of untouched) {
    it(`leaves ${name} alone`, () => {
      expect(repairMojibake(input)).to.equal(input);
    });
  }

  it('repairs a damaged sequence next to genuine non-ASCII characters', () => {
    expect(repairMojibake(u('“Br', 0xc3, 0xbc, '”'))).to.equal('“Brü”');
  });

  // Independent of TextDecoder('windows-1252'), which on some Node/ICU builds is latin1 (0x80-0x9F become C1 controls).
  const cp1252: Array<[number, number]> = [
    [0x20_AC, 0x80], [0x20_1A, 0x82], [0x01_92, 0x83], [0x20_1E, 0x84], [0x20_26, 0x85], [0x20_20, 0x86], [0x20_21, 0x87],
    [0x02_C6, 0x88], [0x20_30, 0x89], [0x01_60, 0x8A], [0x20_39, 0x8B], [0x01_52, 0x8C], [0x01_7D, 0x8E],
    [0x20_18, 0x91], [0x20_19, 0x92], [0x20_1C, 0x93], [0x20_1D, 0x94], [0x20_22, 0x95], [0x20_13, 0x96], [0x20_14, 0x97],
    [0x02_DC, 0x98], [0x21_22, 0x99], [0x01_61, 0x9A], [0x20_3A, 0x9B], [0x01_53, 0x9C], [0x01_7E, 0x9E], [0x01_78, 0x9F],
  ];

  // E2 80 xx is U+2000 + (xx - 0x80)
  for (const [char, byte] of cp1252) {
    it(`reads U+${char.toString(16).toUpperCase()} as byte 0x${byte.toString(16)} (third byte of E2 80 xx)`, () => {
      expect(repairMojibake(u(0xe2, 0x20_ac, char))).to.equal(String.fromCodePoint(0x20_00 + byte - 0x80));
    });
  }

  for (const byte of [0x81, 0x8d, 0x8f, 0x90, 0x9d]) {
    it(`reads the unassigned control character 0x${byte.toString(16)} as the byte it stands for`, () => {
      expect(repairMojibake(u(0xe2, 0x20_ac, byte))).to.equal(String.fromCodePoint(0x20_00 + byte - 0x80));
    });
  }

  it('decodes three- and four-byte sequences at the edges of the lead ranges', () => {
    expect(repairMojibake(u(0xe0, 0xb8, 0x81))).to.equal('\u0E01'); // lead 0xE0
    expect(repairMojibake(u(0xef, 0xbc, 0x2_c6))).to.equal('\uFF08'); // lead 0xEF
    expect(repairMojibake(u(0xf4, 0x8f, 0xbf, 0xbf))).to.equal('\u{10FFFF}'); // lead 0xF4
  });

  it('does not treat 0xC0, 0xC1 or 0xF5 as lead bytes', () => {
    for (const input of [u(0xc0, 0x80), u(0xc1, 0xbf), u(0xf5, 0x80, 0x80, 0x80)]) {
      expect(repairMojibake(input)).to.equal(input);
    }
  });

  it('leaves well-shaped but invalid UTF-8 sequences alone (overlong, surrogate, beyond U+10FFFF)', () => {
    for (const input of [u(0xe0, 0x20_ac, 0x20_ac), u(0xed, 0xa0, 0x20_ac), u(0xf4, 0x90, 0x20_ac, 0x20_ac)]) {
      expect(repairMojibake(input)).to.equal(input);
    }
  });

  it('inverts a latin1-range misreading for every two-byte sequence whose second byte is 0xA0-0xBF', () => {
    const utf8 = new TextDecoder('utf-8');

    for (let lead = 0xC2; lead <= 0xDF; lead++) {
      for (let byte = 0xA0; byte <= 0xBF; byte++) {
        expect(repairMojibake(String.fromCodePoint(lead, byte)), `bytes ${lead.toString(16)} ${byte.toString(16)}`).to.equal(utf8.decode(Uint8Array.of(lead, byte)));
      }
    }
  });

  it('is idempotent on correct text and on its own output', () => {
    for (const text of ['Br\u00FC Club', 'Randall \u201CScott\u201D Gordon', 'K\u00F6lsch', 'plain']) {
      expect(repairMojibake(repairMojibake(text))).to.equal(text);
    }

    const once = repairMojibake(u('Randall ', 0xe2, 0x20_ac, 0x1_53, 'Scott', 0xe2, 0x20_ac, 0x9d));
    expect(repairMojibake(once)).to.equal(once);
  });
});
