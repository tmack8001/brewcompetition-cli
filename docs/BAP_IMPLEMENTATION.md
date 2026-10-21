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

For saved pages where JavaScript has already rendered the data:

```typescript
$('.MuiCard-root').each((index, card) => {
  const categoryName = $(card).find('.MuiCardHeader-title').text();
  
  $(card).find('.jss95').each((awardIndex, awardDiv) => {
    const place = $(awardDiv).find('.jss99').attr('title');
    const paragraphs = $(awardDiv).find('.jss96 p');
    
    const entryName = $(paragraphs[0]).text();
    const style = $(paragraphs[1]).text();
    const brewer = $(paragraphs[2]).text().split(',')[0];
    const club = $(paragraphs[3]).text().replace('Club:', '');
  });
});
```

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
- Best of Show (currently skipped, can be added)
- Mini-BOS (category-level best of show)

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
- Include Best of Show results
- Extract judge scores
- Handle collaboration brewers
- Parse sponsor information
- Support for commercial competitions
