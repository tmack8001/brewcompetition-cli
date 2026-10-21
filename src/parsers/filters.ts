export interface ResultFilters {
  brewers: string | undefined;
  club: string | undefined;
}

/** Letters with no Unicode decomposition, folded to their unaccented spelling. */
const LETTER_FOLDS: Record<string, string> = {
  ß: 'ss',
  æ: 'ae',
  ð: 'd',
  ø: 'o',
  þ: 'th',
  đ: 'd',
  ł: 'l',
  œ: 'oe',
};

const LETTER_FOLD_PATTERN = new RegExp(`[${Object.keys(LETTER_FOLDS).join('')}]`, 'g');

/**
 * Comparison key for a name: apostrophe variants unified, NFKD
 * (also folds ligatures and full-width forms), dash variants unified, combining marks stripped,
 * lower-cased, non-decomposing letters folded, whitespace collapsed.
 * Zero-width and soft-hyphen characters are left in place.
 *
 * @param value the name to normalize
 * @returns the comparison key
 */
export function normalizeForMatch(value: string): string {
  return value
    .replaceAll(/[`\u00B4\u02BC\u2018\u2019\u201B\u2032]/g, "'")
    .normalize('NFKD')
    .replaceAll(/[\u2010-\u2015\u2212]/g, '-')
    .replaceAll(/\p{M}/gu, '')
    .toLowerCase()
    .replaceAll(LETTER_FOLD_PATTERN, letter => LETTER_FOLDS[letter])
    .replaceAll(/\s+/g, ' ')
    .trim();
}

/**
 * Shared --brewers / --club filter. An entry passes when its brewer equals one
 * of the comma-separated --brewers names or its club equals --club, compared
 * with normalizeForMatch. Whole-value match, not substring. A filter value that
 * is blank once normalized matches nothing (it does not widen the result).
 *
 * @param brewer the entry's brewer
 * @param club the entry's club
 * @param filters the --brewers / --club values
 * @returns whether the entry passes the filters
 */
export function shouldIncludeEntry(brewer: string, club: string, filters: ResultFilters): boolean {
  if (!filters.brewers && !filters.club) {
    return true;
  }

  if (filters.brewers) {
    const wanted = filters.brewers.split(',').map(b => normalizeForMatch(b)).filter(Boolean);
    if (wanted.includes(normalizeForMatch(brewer))) {
      return true;
    }
  }

  if (filters.club) {
    const wanted = normalizeForMatch(filters.club);
    if (wanted !== '' && wanted === normalizeForMatch(club)) {
      return true;
    }
  }

  return false;
}
