/**
 * Windows-1252 maps bytes 0x80-0x9F to these characters instead of the C1 control characters. Five bytes
 * (0x81, 0x8D, 0x8F, 0x90, 0x9D) have no character there; software that decodes them anyway yields the
 * control character with the same code point, which the byte lookup below handles.
 */
const CP1252_HIGH: Record<number, number> = {
  0x20_AC: 0x80, 0x20_1A: 0x82, 0x01_92: 0x83, 0x20_1E: 0x84, 0x20_26: 0x85, 0x20_20: 0x86, 0x20_21: 0x87,
  0x02_C6: 0x88, 0x20_30: 0x89, 0x01_60: 0x8A, 0x20_39: 0x8B, 0x01_52: 0x8C, 0x01_7D: 0x8E,
  0x20_18: 0x91, 0x20_19: 0x92, 0x20_1C: 0x93, 0x20_1D: 0x94, 0x20_22: 0x95, 0x20_13: 0x96, 0x20_14: 0x97,
  0x02_DC: 0x98, 0x21_22: 0x99, 0x01_61: 0x9A, 0x20_3A: 0x9B, 0x01_53: 0x9C, 0x01_7E: 0x9E, 0x01_78: 0x9F,
};

const UTF8 = new TextDecoder('utf-8', { fatal: true });

/**
 * The Windows-1252 byte a character stands for, or undefined when that encoding has no such character.
 *
 * @param char one character
 * @returns the byte
 */
function cp1252Byte(char: string): number | undefined {
  const code = char.codePointAt(0) ?? 0;
  return CP1252_HIGH[code] ?? (code <= 0xFF ? code : undefined);
}

/**
 * How many bytes a UTF-8 sequence starting with this byte has, or 0 when the byte cannot start one.
 *
 * @param lead the first byte
 * @returns the sequence length
 */
function sequenceLength(lead: number): number {
  if (lead >= 0xC2 && lead <= 0xDF) return 2;
  if (lead >= 0xE0 && lead <= 0xEF) return 3;
  if (lead >= 0xF0 && lead <= 0xF4) return 4;
  return 0;
}

/**
 * Repairs text that was UTF-8, was decoded as Windows-1252 and was then encoded as UTF-8 again (what the Reggie
 * results pages publish: a brewer entered as `Randall “Scott” Gordon` is served as `Randall â€œScottâ€ Gordon`).
 *
 * Every character is read as the Windows-1252 byte it stands for. A lead byte followed by the right number of
 * continuation bytes is decoded as one UTF-8 character when, and only when, that decode is valid; anything else is
 * kept as it is, so text that is already correct (`Brü`, `Motor Boatin’`) is left alone, as is a damaged
 * sequence that cannot be read back.
 *
 * @param text a name or beer name as published
 * @returns the text with every readable mojibake sequence repaired
 */
export function repairMojibake(text: string): string {
  const chars = [...text];
  const bytes = chars.map(char => cp1252Byte(char));
  let repaired = '';

  for (let index = 0; index < chars.length; index++) {
    const length = sequenceLength(bytes[index] ?? 0);
    const sequence = bytes.slice(index, index + length);
    const readable = length > 0 && sequence.length === length
      && sequence.every((byte, offset) => byte !== undefined && (offset === 0 || (byte >= 0x80 && byte <= 0xBF)));

    if (readable) {
      try {
        repaired += UTF8.decode(Uint8Array.from(sequence as number[]));
        index += length - 1;
        continue;
      } catch {
        // not UTF-8 after all: keep the characters as they are
      }
    }

    repaired += chars[index];
  }

  return repaired;
}
