# Usage Examples

This guide provides comprehensive examples for using the Brew Competition CLI tool across all supported platforms.

## Basic Usage

### Fetch medals from a BCOEM competition
```bash
brewcompetition medals https://example-bcoem.com/competition/results
```

### Fetch medals from a Reggie competition
```bash
brewcompetition medals https://reggiebeer.com/ReggieWeb.php?Web=1000882
```

### Fetch medals from a BAP competition
```bash
brewcompetition medals https://beerawardsplatform.com/2025-ash-copper-state-cup/results
```

The platform is automatically detected based on the URL hostname - no need to specify which platform you're using.

## Filtering Results

### Filter by specific brewers
```bash
brewcompetition medals <url> --brewers "John Doe,Jane Smith"
```

### Filter by club
```bash
brewcompetition medals <url> --club "My Homebrew Club"
```

### Filter by both brewers and club
```bash
brewcompetition medals <url> --brewers "John Doe" --club "My Homebrew Club"
```

## Understanding the Output

### Entry Count Column

All parsers include a dedicated Entry Count column that shows the total number of entries in each category. This helps you understand how competitive each category was:

- A category with 50 entries is highly competitive
- A category with 5 entries is less competitive
- Empty entry counts mean the platform didn't provide this information

The entry count is the same for all winners in a category (since it's the total for that category), making it easy to filter or sort by competitiveness when analyzing results.

## Output Formats

### JSON output (default)
```bash
brewcompetition medals <url> --output json
```

Example output:
```json
{
  "01: Light Lager": [
    {
      "Place": "1st",
      "Entry Count": 12,
      "Brewer": "John Doe",
      "Entry Name": "Crisp Lager",
      "Style": "1A American Light Lager",
      "Club": "Homebrew Club"
    }
  ],
  "21: IPA": [
    {
      "Place": "2nd",
      "Entry Count": 45,
      "Brewer": "Jane Smith",
      "Entry Name": "Hoppy IPA",
      "Style": "21A American IPA",
      "Club": "Homebrew Club"
    }
  ]
}
```

### CSV output
```bash
brewcompetition medals <url> --output csv
```

Example output:
```
Table / Category|Place|Entry Count|Brewer|Entry Name|Style|Club
01: Light Lager|1st|12|John Doe|Crisp Lager|1A American Light Lager|Homebrew Club
21: IPA|2nd|45|Jane Smith|Hoppy IPA|21A American IPA|Homebrew Club
```

## Using Config Files

### Create a config file
Create `my-competitions.json`:
```json
{
  "brewers": ["John Doe", "Jane Smith"],
  "club": "My Homebrew Club",
  "competitions": [
    "https://example-bcoem.com/competition1/results",
    "https://reggiebeer.com/ReggieWeb.php?Web=1000882",
    "https://beerawardsplatform.com/2025-ash-copper-state-cup/results"
  ]
}
```

### Run with config file
```bash
brewcompetition medals --file my-competitions.json --output json
```

This will fetch results from all three competitions and apply the same filters to each.

## Competition Metadata

### Fetch competition metadata (BCOEM only currently)
```bash
brewcompetition competitions <bcoem-url>
```

Example output:
```json
{
  "data": {
    "entrant_registration": "Registration opens Monday, March 1, 2025...",
    "entrant_registration_start_date": "2025-03-01T00:00:00.000Z",
    "entrant_registration_end_date": "2025-03-15T23:59:59.000Z",
    "entry_registration": "Entry registration opens...",
    "awards_ceremony": "Awards ceremony on Saturday, April 15, 2025..."
  }
}
```

## Advanced Examples

### Pipe JSON output to jq for processing
```bash
brewcompetition medals <url> --output json | jq '.[] | .[] | select(.Place == "1st")'
```

### Save results to a file
```bash
brewcompetition medals <url> --output csv > results.csv
```

### Process multiple competitions and combine results
```bash
# Create a script to fetch from multiple sources
for url in \
  "https://reggiebeer.com/ReggieWeb.php?Web=1000882" \
  "https://beerawardsplatform.com/2025-ash-copper-state-cup/results"
do
  echo "Fetching from $url"
  brewcompetition medals "$url" --brewers "Your Name" --output json
done
```

### Check which platform is detected
The tool automatically detects the platform based on the URL hostname:
- `reggiebeer.com` → Reggie parser
- `beerawardsplatform.com` → BAP parser
- Everything else → BCOEM parser (default)

## Real-World Workflows

### Track your club's performance across multiple competitions

1. Create `club-config.json`:
```json
{
  "club": "My Homebrew Club",
  "competitions": [
    "https://competition1.com/results",
    "https://reggiebeer.com/ReggieWeb.php?Web=123456",
    "https://beerawardsplatform.com/competition/results"
  ]
}
```

2. Fetch all results:
```bash
brewcompetition medals --file club-config.json --output json > club-results.json
```

3. Analyze results:
```bash
# Count total medals
cat club-results.json | jq '[.[] | .[]] | length'

# List all gold medals
cat club-results.json | jq '.[] | .[] | select(.Place | contains("1st") or contains("Gold"))'

# Find most competitive categories
cat club-results.json | jq '.[] | .[] | select(.["Entry Count"] > 30)'
```

### Track individual brewer performance

```bash
# Create a personal config
cat > my-results.json << EOF
{
  "brewers": ["Your Name"],
  "competitions": [
    "https://competition1.com/results",
    "https://competition2.com/results"
  ]
}
EOF

# Fetch and save results
brewcompetition medals --file my-results.json --output csv > my-medals.csv

# Import into spreadsheet for analysis
```

### Monitor competition registration deadlines

```bash
# Get competition metadata (BCOEM only)
brewcompetition competitions https://example-bcoem.com/competition

# Output includes registration dates, entry deadlines, and awards ceremony info
```

## Troubleshooting

### No results returned
- Verify the URL is correct and accessible
- Try without filters first: `brewcompetition medals <url>`
- Check if the competition has published results

### Wrong platform detected
- Verify the URL hostname
- BCOEM is the default for unknown hostnames
- Check `PLATFORM_SUPPORT.md` for hostname patterns

### Parser errors
- The HTML structure might differ from expected
- See `TESTING_GUIDE.md` for debugging steps
- Consider opening an issue with the URL for investigation
