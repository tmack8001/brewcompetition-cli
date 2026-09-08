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

Metadata lives on the entry-info page, `index.php?section=entry`, not on the URL
a user typically has to hand. `BCOEMParser.metadataUrls()` returns both so the
`competitions` command can try the given URL and then its entry-info variant.

BCOEM is open source and self-hosted, so more than one generation of the
software is live at any time. Two are common.

**Anchor build.** Each section is introduced by an empty named anchor:

```html
<a name="reg_window"></a>
<h2>Account Registration</h2>
<p>Registration opens Monday, March 1, 2025 12:00 AM, MST and closes Friday, March 15, 2025 11:59 PM, MST.</p>

<a class="anchor-offset" name="entry-registration"></a>
<h2>Entry Registration</h2>
<p>Entry registration opens...</p>
```

The anchor is the heading lowercased with spaces hyphenated, built in
`sections/entry_info.sec.php`:

```php
$anchor_name = str_replace(" ", "-", $label_entry_registration);
sprintf("<a class=\"anchor-offset\" name=\"%s\"></a><h2>%s</h2>", strtolower($anchor_name), $label_entry_registration);
```

Since the label is translated, a non-English install produces entirely different
anchors. `reg_window` is the one BCOEM hardcodes. Drop-off has two spellings even
in English: `Entry Delivery` for a single location, `Drop-Off Locations` for
several.

**Landing-page build.** Content is grouped into
`<section class="landing-page-section">` blocks with each subsection in a
`<div class="reveal-element">`, and the page opens with an "At a Glance" card
grid stating every window as an explicit timestamp pair:

```html
<div class="card-body glance-card-body">
  <h5 class="card-title glance-header">Entry Registration</h5>
  <p><small><ul class="list-unstyled">
    <li><strong>Open</strong> &ndash; 07/04/2026 10:00 AM, EDT</li>
    <li><strong>Close</strong> &ndash; 09/18/2026 5:00 PM, EDT</li>
  </ul></small></p>
</div>
```

Anchors are present on this build but unusable: the same
`name="judging-sessions"` precedes Drop-Off Locations, Shipping Info *and*
Awards Ceremony, because `$anchor_name` is not reset between sections. Headings
also carry an inline status - `<h2>Entry Registration is <span>Open</span></h2>`.

### Conditional sections

`entry_info.sec.php` gates several sections on competition state, so a closed
competition legitimately renders fewer than an open one:

| Section | Rendered when |
| --- | --- |
| Entry Acceptance Rules | drop-off or shipping window not yet closed |
| Shipping Info | shipping enabled and its window not yet closed |
| Drop-off | at least one location configured |

The bottle count is emitted into the Entry Acceptance Rules body but *outside*
the guard that renders its heading, so on a closed competition it detaches and
trails whichever section came before.

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

`src/parsers/bcoem-sections.ts` splits the page into `<h2>` sections, then each
field is resolved by three strategies, most reliable first:

1. **At a Glance card** (`extractGlanceWindows`) - an explicit timestamp pair.
   Only the newer build has these, and they are worth preferring: the prose on
   that build omits the account window entirely and states the entry window only
   as descriptive rules text.
2. **Heading match** (`findSection`) - the `<h2>` text, matched
   case-insensitively against its start so an inline status does not break it.
   This is the only thing dependable across both builds.
3. **Anchor match** - the original `a[name="..."]` lookup, retained for
   self-hosted installs running older releases.

Paragraphs are collected with `nextUntil('h2')` rather than `nextAll('p')`, so a
section stops at the next heading. The old walk ran past the end of a section and
pulled the following one's paragraphs in whenever a section was shorter than
expected - which is routine, since a closed competition renders one paragraph
where an open one renders two.

### Date Extraction

Prose windows use a long-form date; glance cards use a numeric one:

```typescript
// Prose:  "Friday, August 14, 2026 12:00 AM, EDT — Friday, September 18, 2026 5:00 PM, EDT."
// Cards:  "08/14/2026 12:00 AM, EDT"
```

Two things about the prose form are easy to get wrong. The full stop terminates
the *pair*, so requiring one matches the closing date but never the opening one.
And the parts are full names on a 12-hour clock, so the moment format has to be
`dddd, DD MMMM YYYY hh:mm A` - parsing `12:00 AM` with `HH` silently yields
midday, putting every midnight window twelve hours late.

Timezone abbreviations map to IANA zones, standard and daylight alike: a window
that opens in October and closes in November is quoted in CDT and CST
respectively.

A section that states no dates is normal, not exceptional - a closed competition
renders "Registration is closed." and nothing more - so extraction returns
`undefined` bounds rather than throwing.

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
- Missing metadata sections (leaves the column empty)
- Sections that state no dates (leaves the date columns empty)
- Empty results (logs error message)

A competition whose entry-info page is gated behind a login - which BCOEM does
once the windows have closed - yields no metadata from any candidate URL. The
`competitions` command reports that explicitly rather than printing a row of
empty columns.

## Testing

Test fixtures include:
- `test/resources/results/bcoem_results.html` - Full results page
- `test/resources/metadata/bcoem_info.html` - Competition info page, anchor build, closed
- `test/resources/metadata/bcoem_info_closed.html` - Anchor build, closed
- `test/resources/metadata/bcoem_info_landing.html` - Landing-page build, open

See `test/resources/metadata/README.md` for what each fixture pins and how to
capture another.

Tests verify:
- Results parsing with filters
- Metadata extraction on both builds
- Date parsing, including midnight and open-ended windows
- Section scoping (a short section does not absorb the next one)
- Metadata URL discovery
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
