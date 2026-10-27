# BAP (Beer Awards Platform) Parser Implementation

## Overview

The BAP parser successfully handles both live and saved BAP competition pages by implementing a dual-mode parsing strategy with API-first approach.

## Challenge

BAP is a React-based Single Page Application (SPA) that:
1. **Live pages**: Serve minimal HTML with data loaded via API calls
2. **Saved pages**: Contain fully rendered HTML with MUI components

## Solution

The parser attempts API extraction first, then falls back to HTML parsing:

```typescript
// Try API first if we have a URL
if (url) {
  const competitionKey = this.extractCompetitionKey(url);
  if (competitionKey) {
    data = await this.parseApiData(competitionKey, filters);
  }
}

// Fall back to HTML parsing (saved pages)
if (data.length === 0) {
  data = this.parseHtmlData(html, filters);
}
```

## API Structure

BAP uses a two-step API process:

### Step 1: Get Competition Info
```bash
GET https://beerawardsplatform.com/api/loadCompetitionInfo?competitionKey={key}&includeEntryCount
```

**Purpose**: Extract the `competitionId` from the competition key

**Example Response**:
```json
{
  "competition": {
    "competitionId": "Po3yXa0IULLxtPjWBlvm",
    "name": "2025 ASH Copper State Cup",
    "type": "HOMEBREW",
    ...
  }
}
```

### Step 2: Get Results
```bash
GET https://beerawardsplatform.com/api/getResults?competitionId={id}
```

**Purpose**: Fetch all competition results

**Example Response Structure**:
```json
{
  "results": {
    "miniBos": {
      "categoryId": {
        "id": "categoryId",
        "name": "Spiced and Specialty Mead 9 Entries",
        "positions": {
          "1": [
            {
              "name": "Sable Porter",
              "styleSubcategory": "American Porter",
              "participant": {
                "name": "Christian Chandler",
                "club": "Arizona Society of Homebrewers"
              }
            }
          ],
          "2": [...],
          "3": [...],
          "4": [...]
        }
      }
    }
  }
}
```

## Data Extraction

### From API (Primary)

```typescript
for (const categoryId in results) {
  const category = results[categoryId];
  const categoryName = category.name;
  const positions = category.positions;
  
  for (const position in positions) {
    const entries = positions[position];
    entries.forEach((entry) => {
      const brewer = entry.participant?.name;
      const club = entry.participant?.club;
      const entryName = entry.name;
      const style = entry.styleSubcategory;
      const place = `#${position}`;
    });
  }
}
```

### From HTML (Fallback)

For saved pages where JavaScript has already rendered the data. The page must be a
rendered DOM snapshot (for example `chrome --headless --dump-dom
--virtual-time-budget=20000 <url>`); the bare fetch is a small app shell and is
rejected with an error (see below). The parser never uses class names, which
change between BAP builds. It reads the page the way a person does:

- Each award row is found by its medal marker, an element titled `#1`, `#2`, `#3`
  or `#4` (1st, 2nd, 3rd, HM); other numbers are passed through as `#N`. The
  title is the only place BAP exposes the place;
  the icon itself has no text. A place that comes before an earlier one in the same
  category is rejected; ties are allowed.
- The category is the nearest preceding text block that holds no medal marker
  (the heading, e.g. `Amber Lager 17 Entries` or `Porter and Stout (10)`).
  The overall `Best of Show` card is read like any other table, except that its `Entry Count` is always blank, even if the heading shows a count (the API path has none).
- Within a row, the paragraphs/headings in document order are: entry name, a style
  line matching `<code> - <style>`, the brewer line (`Name, city, ST, USA`), an
  optional `Collaboration with ...` line and a `Club: X` line. Rows containing
  `No award...` are skipped. A row whose only text is one line is a custom award
  (`name \ style \ brewer \ Club: X`, the club part optional) and is read as such
  (see Best of Show below). So is a one-line row in the old wording (it contains
  ` / Club:`), under any heading. Any other one-line row is a damaged row and throws.
  A custom award's category is its heading without a trailing `N Entries` or `(N)`.
- A saved page with no medal markers, a row without a style line or a row that
  lost its medal title usually throws `BapHtmlStructureError`. When the API was tried
  first (a URL was given) the error is swallowed and the result is empty.

## Competition Key Extraction

The competition key is extracted from the URL:

```typescript
// URL: https://beerawardsplatform.com/2025-ash-copper-state-cup/results
// Key: 2025-ash-copper-state-cup
```

The key is the first path segment of the parsed URL, so bare competition URLs
(`/2025-ash-copper-state-cup`), trailing-slash URLs, `/results` URLs and URLs with
a query string or fragment all work. When a URL is given, `parseResults` throws when:

- the URL yields no key (not a BAP host, or no path segment);
- the API reports the key as unknown (HTTP 404, or no `competitionId`);
- the API cannot be read and the saved-HTML fallback finds nothing.

A competition that was read but has no medals, or none matching `--club` /
`--brewers`, returns `undefined` after saying which. `medals` logs errors and exits
with status 1; with a config file every competition is still attempted. The key is
percent-decoded from the path and percent-encoded in the API query string.

## Place Format

BAP uses position numbers (1, 2, 3, 4) which are converted to standardized format:
- `1` → `1st` (Gold)
- `2` → `2nd` (Silver)
- `3` → `3rd` (Bronze)
- `4` → `HM` (Honorable Mention)

## Entry Count Extraction

BAP puts the entry count at the end of the category name, and has used two forms:

- `"Porter and Stout (10)"` (older)
- `"Spiced and Specialty Mead 9 Entries"` (current; `"High Gravity 1 Entry"` when there is one)

Both are supported. The count is removed from the name and reported in its own column:

```typescript
const BAP_ENTRY_COUNT_SUFFIX = /\s*(?:\((\d+)\)|(?<!\S)(\d+)\s+entr(?:y|ies))\s*$/i;
const match = categoryNameRaw.match(BAP_ENTRY_COUNT_SUFFIX);
const entryCount = match ? (match[1] ?? match[2]) : '';
const categoryName = categoryNameRaw.replace(BAP_ENTRY_COUNT_SUFFIX, '').trim();
```

The `N Entries` form needs whitespace before the number (`Porter9 Entries` is left alone). A name with no count gets an empty `Entry Count`. Commas are stripped from every field, so `Pale, Amber, and Brown American Ales 15 Entries` becomes category `Pale Amber and Brown American Ales`, count `15`.

Not handled (BAP does not produce them): `1,234 Entries` and `(10 Entries)`.

This entry count is included as a dedicated column in the output, making it easy to see how competitive each category was.

## Category Handling

The parser handles all BAP category types:
- Regular beer/mead/cider categories
- Mini-BOS (category-level best of show, `results.miniBos`)
- Best of Show (`results.bos`)
- Custom awards (`results.custom.awards`)

### Best of Show

BAP keeps the overall Best of Show outside `miniBos`, in two places of the
`getResults` response. Both are emitted, by the API path and the saved-HTML path
alike, with a blank `Entry Count`:

- `results.bos.positions` (`{"1": [entry...], "2": [...], ...}`, same entry shape as
  `miniBos`) becomes rows in the category `Best of Show`, the heading BAP's own
  page uses. Places follow the usual mapping, so a 4th place is `HM`.
- `results.custom.awards` (`[{name, positions: [string, ...]}]`) becomes one row per
  position, in the category named by the award verbatim (for example
  `Best of Show - Mead & Cider`); the place is the position's index plus one.
  A position is one display string, `entry \ M2A - Cyser \ Brewer, City, ST, USA \ Club: X`:
  the style id is dropped, the brewer is the text before the first comma and the
  club part may be absent. `No award...` positions give no row (but still use up
  their place number).

A custom string in any other wording (older competitions used
`Brewer / Club: X - Entry (style)`) is never guessed at and, on the API path, never
fatal, so the competition's other medals are always returned. (On a saved page a
single-line row that contains neither ` \ ` nor ` / Club:` is a damaged row and still
raises `BapHtmlStructureError`; that is deliberate.) Each distinct unreadable line is
reported once per run on stderr:

- `Skipping BAP custom award "<name>": unrecognized format ...` for an ordinary line.
- `WARNING: BAP custom award "<name>" has a line in an unrecognized format that
  mentions the requested club or brewer; its medal could NOT be read and is missing
  from this output: ...` when the line names the requested `--club` or `--brewers`
  (whole words, compared like the filters compare names, so `Brü` equals `Bru` and
  `ASH` does not match `CASH CIDER`). Check such a competition by hand.

If nothing at all is returned, the final stderr message adds how many lines were
skipped. The format also accepts `Collaboration with ...` parts after the brewer,
which are ignored.

The `--club` and `--brewers` filters apply to the rows that are read like any other.
A table in `miniBos` whose name starts with `Best of Show` is emitted as an
ordinary table with its entry count. A `bos` or custom-award row that repeats one of
its rows (same category, place, entry, style, brewer and club, compared ignoring
case, accents and spacing) is dropped, so a medal listed both ways is counted once;
tied entries and other rows are kept. This is fully effective on the API path; on
a saved page a table named exactly `Best of Show` is indistinguishable from the
overall card.

## Testing

Two test modes ensure both formats work:
- API mode: Tested with live URLs
- HTML mode: Tested with saved HTML fixture

## Example Usage

```bash
# Works with live URL (uses API)
brewcompetition medals https://beerawardsplatform.com/2025-ash-copper-state-cup/results \
  --brewers "Cheyne Harvey" \
  --output csv

# Also works with saved HTML file (uses HTML parsing)
brewcompetition medals file://path/to/saved-bap-page.html \
  --brewers "Cheyne Harvey" \
  --output json
```

## Performance

- API calls are fast (< 1 second for most competitions)
- No need for headless browser or JavaScript execution
- Works with simple HTTP GET requests
- Handles large competitions (200+ entries) efficiently

## Error Handling

The parser gracefully handles:
- Missing competition keys
- API failures (falls back to HTML)
- Missing participant data
- Empty categories
- Network errors

## Future Enhancements

Potential improvements:
- Parse metadata (competition name, dates, location)
- Extract judge scores
- Handle collaboration brewers
- Parse sponsor information
- Support for commercial competitions
