# Reggie Parser Implementation

## Overview

The Reggie parser successfully handles both live and saved Reggie competition pages by implementing a dual-mode parsing strategy.

## Challenge

Reggie pages serve data in two different formats:
1. **Live pages**: Data embedded in JavaScript arrays (`var aaReggieMedals=[...]`)
2. **Saved pages**: Data rendered as HTML tables by browser JavaScript

## Solution

The parser attempts JavaScript extraction first, then falls back to HTML parsing:

```typescript
// Try JavaScript data first (live pages)
const jsDataMatch = html.match(/var aaReggieMedals=\[([\s\S]*?)\];/);
if (jsDataMatch) {
  data = this.parseJavaScriptData(jsDataMatch[1], ...);
}

// Fall back to HTML parsing (saved pages)
if (data.length === 0) {
  data = this.parseHtmlData(html, ...);
}
```

## JavaScript Data Format

Reggie stores medals in a JavaScript array with this structure:

```javascript
var aaReggieMedals=[
  ["1","0","1","Donald Schneider","American Lager","1A: American Light Lager","Bud Aight","Weizguys Homebrew Club (Loveland, CO)","","19783","<span...>MHP</span>","1371","38"]
  ,["2","0","1","Donald Schneider","American Lager","1B: American Lager","Dad Beer","Weizguys Homebrew Club (Loveland, CO)","","19783","<span...>MHP</span>","1003","38"]
  // ... more entries
];
```

### Field Mapping
- `[0]` - Place (1, 2, 3, etc.)
- `[1]` - Type (0=regular, 1=BOS, 2=Heavy Medal Brewer, 3=Heavy Medal Club)
- `[2]` - Show Label
- `[3]` - Brewer Name
- `[4]` - Category/Group
- `[5]` - Style
- `[6]` - Beer Name
- `[7]` - Club
- `[8]` - Co-Brewer
- `[9]` - Entrant ID
- `[10]` - Certification Ranks (HTML with MHP badge)
- `[11]` - Entry ID
- `[12]` - Score

## Parsing Strategy

### JavaScript Extraction (Primary)

Uses regex to extract the first 8 fields from each entry:

```typescript
const medalRegex = /\["(\d+)","(\d+)","([^"]+)","([^"]+)","([^"]+)","([^"]+)","([^"]+)","([^"]+)"/g;
```

**Why regex instead of JSON.parse?**
- The data contains HTML strings with control characters
- Comments exist in the JavaScript code
- Not valid JSON, but valid JavaScript array literals
- Regex is more robust for this specific format

### HTML Parsing (Fallback)

For saved pages where JavaScript has already rendered the tables:

```typescript
$('tbody tr').each((index, row) => {
  // Check for category headers
  const groupHeader = $row.find('td.GroupHeader');
  
  // Extract data from table cells
  const cells = $row.find('td');
  // cells[0] = Brewer, cells[1] = Medal, etc.
});
```

## Entry Count Extraction

Reggie includes entry counts in two places:

1. **JavaScript data**: In the `saReggieGroups` array with format `["Category Name","","",entryCount,[]]`
2. **HTML data**: In category headers with format `"Category Name (14 entries)"`

The parser extracts this information from both sources:

```typescript
// From JavaScript groups array
const groupRegex = /\["([^"]+)","[^"]*","[^"]*",(\d+),/g;
const entryCountMap: { [key: string]: string } = {};
while ((groupMatch = groupRegex.exec(groupsData)) !== null) {
  const categoryName = groupMatch[1].trim();
  const entryCount = groupMatch[2].trim();
  entryCountMap[categoryName] = entryCount;
}

// From HTML headers
const entryCountMatch = categoryRaw.match(/\((\d+)\s+entries\)$/);
const entryCount = entryCountMatch ? entryCountMatch[1].trim() : '';
```

This entry count is included as a dedicated column in the output, making it easy to see how competitive each category was.

## Medal Type Conversion

Place numbers are converted to standardized format:
- `"1"` → `"1st"` (Gold)
- `"2"` → `"2nd"` (Silver)
- `"3"` → `"3rd"` (Bronze)
- `"4"` → `"HM"` (Honorable Mention)

## Category Types

The parser handles all Reggie category types:
- Regular beer/mead/cider categories
- Pro/Am awards
- Best of Show (Beer, Mead/Cider)
- Heavy Medal (Brewer, Club)

## Testing

Two test fixtures ensure both modes work:
- `reggie_results.html` - Rendered HTML (saved page)
- `reggie_results_raw.html` - Raw JavaScript (live page)

Both fixtures use the same competition (Rocky Mountain Homebrew Challenge 2024) to ensure consistent results.

## Example Usage

```bash
# Works with live URL
brewcompetition medals https://reggiebeer.com/ReggieWeb.php?Web=1000882 \
  --brewers "Donald Schneider" \
  --output csv

# Also works with saved HTML file
brewcompetition medals file://path/to/saved-reggie-page.html \
  --brewers "Donald Schneider" \
  --output json
```

## Performance

- Regex parsing is fast and efficient
- No need to execute JavaScript or use a headless browser
- Works with simple HTTP GET request
- Handles large competitions (100+ entries) without issues

## Future Enhancements

Potential improvements:
- Parse metadata (competition name, date, location)
- Extract judge scores and feedback
- Handle Pro/Am sponsor information
- Parse Heavy Medal point totals
