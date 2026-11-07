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
 * The names in a comma-separated --brewers value, as comparison keys (blank names dropped).
 *
 * @param brewers the --brewers value
 * @returns the normalized names
 */
export function wantedBrewers(brewers: string): string[] {
  return brewers.split(',').map(b => normalizeForMatch(b)).filter(Boolean);
}

/**
 * Separators between the several names a brewer or club field can list: " / " (BAP's "The Brü Club / Little
 * Mountain Brewers"), ";" and ",". A bare "/" inside a word is not one, so "AC/DC Brewers" stays whole.
 */
const FIELD_SEPARATOR = /\s+\/\s+|\s*[,;]\s*/;

/**
 * The comparison keys an entry's brewer or club field can be matched by: the whole value, and each name when the
 * field lists several (split on " / ", ";" or ","). Blank keys are dropped.
 *
 * @param field the brewer or club as published
 * @returns the normalized whole value followed by the normalized parts
 */
export function fieldKeys(field: string): string[] {
  return [...new Set([field, ...field.split(FIELD_SEPARATOR)].map(part => normalizeForMatch(part)).filter(Boolean))];
}

/**
 * Shared --brewers / --club filter. An entry passes when its brewer equals one
 * of the comma-separated --brewers names or its club equals --club, compared
 * with normalizeForMatch. Whole-value match, not substring: when the entry's
 * brewer or club field lists several names ("The Brü Club / Little Mountain
 * Brewers"), the filter must equal the whole field or one complete name in it
 * (see fieldKeys), so "ASH" does not match "CASH CIDER". A filter value that
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
    const wanted = wantedBrewers(filters.brewers);
    if (fieldKeys(brewer).some(key => wanted.includes(key))) {
      return true;
    }
  }

  if (filters.club) {
    const wanted = normalizeForMatch(filters.club);
    if (wanted !== '' && fieldKeys(club).includes(wanted)) {
      return true;
    }
  }

  return false;
}
