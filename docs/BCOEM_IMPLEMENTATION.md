# BCOEM (Brew Competition Online Entry Management) Parser Implementation

## Overview

The BCOEM parser is the original implementation that handles competitions hosted on the BCOEM platform. It uses traditional HTML parsing with cheerio to extract results and metadata from server-rendered pages.

## Platform Background

BCOEM is an open-source competition management system:
- **Repository**: https://github.com/geoffhumphrey/brewcompetitiononlineentry
- **Rendering**: Server-side HTML generation
- **Structure**: Traditional table-based layout with semantic CSS classes
- **Data**: Fully rendered in initial HTML response

## HTML Structure

BCOEM uses a consistent, well-structured HTML format:

### Results Tables

```html
<div class="bcoem-winner-table">
  <h3>01: Light Lager</h3>
  <table>
    <thead>
      <tr>
        <th>Place</th>
        <th>Brewer</th>
        <th>Entry Name</th>
        <th>Style</th>
        <th>Club</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>1st</td>
        <td>John Doe MHP</td>
        <td>My Lager</td>
        <td>1A: American Light Lager</td>
        <td>Homebrew Club</td>
      </tr>
    </tbody>
  </table>
</div>
```

### Metadata Sections

BCOEM includes detailed competition metadata with named anchors:

```html
<a name="reg_window"></a>
<p>Registration opens Monday, March 1, 2025 12:00 AM, MST and closes Friday, March 15, 2025 11:59 PM, MST.</p>

<a name="entry-registration"></a>
<p>Entry registration opens...</p>

<a name="drop-off-locations"></a>
<p>Drop off entries between...</p>

<a name="awards-ceremony"></a>
<p>Awards ceremony on Saturday, April 15, 2025...</p>
```

## Parsing Strategy

### Results Parsing

The parser uses the `.bcoem-winner-table` class as the primary selector:

```typescript
$('.bcoem-winner-table').each((index, element) => {
  const tableNameRaw = $(element).find('h3').text().trim();
  
  // Skip aggregate tables (Brewers, Clubs)
  if (tableNameRaw.includes("Brewers") || tableNameRaw.includes("Clubs")) {
    return;
  }
  
  // Extract entry count from table name (format: "Table 1: Category (7 entries)")
  const entryCountMatch = tableNameRaw.match(/\((\d+)\s+entries\)$/);
  const entryCount = entryCountMatch ? entryCountMatch[1].trim() : '';
  const tableName = tableNameRaw.replace(/\s*\(\d+\s+entries\)$/, '').trim();
  
  // Extract headers
  $(element).find('table thead tr th').each((index, element) => {
    header.push($(element).text().trim());
  });
  
  // Extract data rows
  $(element).find('table tbody tr').each((index, row) => {
    const cells = $(row).find('td');
    // cells[0] = Place, cells[1] = Brewer, cells[2] = Entry Name, 
    // cells[3] = Style, cells[4] = Club
    // Entry count is added as a separate column
  });
});
```

### Metadata Parsing

Metadata is extracted using named anchors and adjacent paragraph elements:

```typescript
const accountRegWindow = $('a[name="reg_window"]').nextAll('p').eq(0).text();
const entryRegWindow = $('a[name="entry-registration"]').nextAll('p').eq(0).text();
const dropOffWindow = $('a[name="drop-off-locations"]').nextAll('p').eq(0).text();
const awardsCeremony = $('a[name="awards-ceremony"]').nextAll('p').eq(0).text();
```

### Date Extraction

BCOEM uses a consistent date format that the parser extracts:

```typescript
// Format: "Monday, March 1, 2025 12:00 AM, MST"
const dateRegex = /(today)|(?:(Sunday|Monday|...), ([A-Za-z]+) (\d{1,2}), (\d{4}) (\d{1,2}:\d{2} [AP]M), ([A-Za-z]+)\.)/g;
```

The parser extracts:
- Start date (first date in text)
- End date (second date in text)
- Timezone information

## Special Handling

### MHP Badge

BCOEM appends " MHP" (Master Homebrewer Program) to brewer names:

```typescript
const cellText = $(element).text().trim().replaceAll(',', '');
rowData.push(cellText.replaceAll(' MHP', ''));
```

### Aggregate Tables

BCOEM includes summary tables for "Top Brewers" and "Top Clubs" which are skipped:

```typescript
if (tableName.includes("Brewers") || tableName.includes("Clubs")) {
  return; // Skip aggregate tables
}
```

### Comma Handling

Since the output format uses pipe-delimited CSV, commas in text are removed:

```typescript
const cellText = $(element).text().trim().replaceAll(',', '');
```

## Data Structure

### Results Output

All platforms use standardized place format:
- `1st` (Gold)
- `2nd` (Silver)
- `3rd` (Bronze)
- `HM` (Honorable Mention for 4th place)

The output includes a dedicated Entry Count column showing the total number of entries in each category:

```
Table / Category|Place|Entry Count|Brewer|Entry Name|Style|Club
01: Light Lager|1st|12|John Doe|My Lager|1A: American Light Lager|Homebrew Club
01: Light Lager|2nd|12|Jane Smith|Another Lager|1A: American Light Lager|Homebrew Club
01: Light Lager|3rd|12|Bob Jones|Third Lager|1A: American Light Lager|Homebrew Club
01: Light Lager|HM|12|Alice Brown|Fourth Lager|1A: American Light Lager|Homebrew Club
```

### Metadata Output

```
entrant_registration|entrant_registration_start_date|entrant_registration_end_date|...
Registration opens...|2025-03-01T00:00:00.000Z|2025-03-15T23:59:59.000Z|...
```

## Filtering

The parser supports filtering by:

1. **Brewer Name**: Comma-separated list of exact matches
2. **Club Name**: Exact match (case-sensitive)
3. **Both**: Results matching either condition

```typescript
// If no filters, include everything
if (!filters.brewers && !filters.club) {
  include = true;
}

// Check brewer filter
if (!include && filters.brewers) {
  const brewerList = filters.brewers.split(',').map(b => b.trim());
  if (brewerList.includes(brewer)) {
    include = true;
  }
}

// Check club filter
if (!include && filters.club && club === filters.club) {
  include = true;
}
```

## Advantages

### Reliability
- Server-rendered HTML is consistent
- No JavaScript execution required
- All data available in initial response

### Performance
- Fast parsing with cheerio
- Single HTTP request
- No API calls needed

### Completeness
- Full metadata support
- All competition information available
- Detailed date/time information

## Example Usage

```bash
# Fetch results
brewcompetition medals https://example-bcoem.com/competition/results \
  --brewers "John Doe,Jane Smith" \
  --club "Homebrew Club" \
  --output csv

# Fetch metadata
brewcompetition competitions https://example-bcoem.com/competition/info \
  --output json
```

## Metadata Fields

The parser extracts comprehensive competition metadata:

| Field | Description |
|-------|-------------|
| `entrant_registration` | Full text of registration window |
| `entrant_registration_start_date` | Parsed start date |
| `entrant_registration_end_date` | Parsed end date |
| `volunteer_registration` | Volunteer signup window |
| `entry_registration` | Entry submission window |
| `num_required` | Number of bottles required |
| `drop_off_window` | Drop-off dates and locations |
| `shipping_window` | Shipping deadline information |
| `awards_ceremony` | Awards ceremony date and location |

## Timezone Handling

The parser includes a timezone mapping for common abbreviations:

```typescript
const timezoneMap: { [key: string]: string } = {
  'AEST': 'Australia/Sydney',
  'BST': 'Europe/London',
  'CDT': 'America/Chicago',
  'CET': 'Europe/Paris',
  'EDT': 'America/New_York',
  'JST': 'Asia/Tokyo',
  'MDT': 'America/Denver',
  'PDT': 'America/Los_Angeles'
};
```

Falls back to system timezone if abbreviation not found.

## Error Handling

The parser gracefully handles:
- Missing tables (returns undefined)
- Missing metadata sections (throws error with context)
- Invalid date formats (throws error with date string)
- Empty results (logs error message)

## Testing

Test fixtures include:
- `test/resources/results/bcoem_results.html` - Full results page
- `test/resources/metadata/bcoem_info.html` - Competition info page

Tests verify:
- Results parsing with filters
- Metadata extraction
- Date parsing
- MHP badge removal
- Comma handling

## Future Enhancements

Potential improvements:
- Support for multiple date formats
- Better timezone detection
- Parse judge scores
- Extract entry counts
- Support for special awards
- Handle multi-day competitions

## Comparison with Other Platforms

| Feature | BCOEM | Reggie | BAP |
|---------|-------|--------|-----|
| **Rendering** | Server-side | JavaScript | React SPA |
| **Data Access** | HTML | JS Arrays | REST API |
| **Metadata** | ✅ Full | ⏳ Pending | ⏳ Pending |
| **Complexity** | Low | Medium | Medium |
| **Reliability** | High | High | High |

## Conclusion

The BCOEM parser is the most straightforward implementation due to:
- Traditional server-rendered HTML
- Consistent structure with semantic classes
- All data in initial response
- Comprehensive metadata support

It serves as the baseline implementation and default parser for unknown platforms.
