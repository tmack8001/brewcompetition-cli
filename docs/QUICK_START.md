# Quick Start Guide

Get up and running with Brew Competition CLI in minutes.

## Installation

### From npm (recommended)

```bash
npm install -g brewcompetition-cli
```

### From source

```bash
git clone https://github.com/tmack8001/brewcompetition-cli.git
cd brewcompetition-cli
npm install
npm run build
npm link
```

## Your First Command

Fetch all medal winners from a competition:

```bash
brewcompetition medals https://reggiebeer.com/ReggieWeb.php?Web=1000882
```

That's it! The tool automatically detects the platform and fetches the results.

## Supported Platforms

The CLI supports three major homebrew competition platforms:

- ✅ **BCOEM** - Full support (results + metadata)
- ✅ **Reggie** - Results parsing
- ✅ **BAP** - Results parsing via API

The platform is automatically detected based on the URL - no configuration needed.

## Common Use Cases

### Find your medals

```bash
brewcompetition medals <competition-url> --brewers "Your Name"
```

### Track your club's performance

```bash
brewcompetition medals <competition-url> --club "Your Homebrew Club"
```

### Export to CSV for spreadsheet analysis

```bash
brewcompetition medals <competition-url> --output csv > results.csv
```

### Check multiple competitions at once

Create a config file `my-competitions.json`:

```json
{
  "brewers": ["Your Name"],
  "competitions": [
    "https://competition1.com/results",
    "https://competition2.com/results"
  ]
}
```

Then run:

```bash
brewcompetition medals --file my-competitions.json
```

## Understanding the Output

### JSON Format (default)

Results are grouped by category:

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
  ]
}
```

### CSV Format

Pipe-delimited for easy import into spreadsheets:

```
Table / Category|Place|Entry Count|Brewer|Entry Name|Style|Club
01: Light Lager|1st|12|John Doe|Crisp Lager|1A American Light Lager|Homebrew Club
```

The **Entry Count** column shows how many entries were in each category, helping you understand competitiveness.

## Troubleshooting

### No results returned

- Verify the URL is correct and accessible
- Try without filters first: `brewcompetition medals <url>`
- Check if results have been published

### Wrong platform detected

The tool detects platforms by URL hostname:
- `reggiebeer.com` → Reggie
- `beerawardsplatform.com` → BAP  
- Everything else → BCOEM (default)

### Parser errors

If you encounter parsing issues:
1. Check the [TESTING_GUIDE.md](TESTING_GUIDE.md) for debugging steps
2. Open an issue with the competition URL
3. The HTML structure may differ from expected

## Need Help?

Check these docs:
- `TESTING_GUIDE.md` - Detailed debugging steps
- `EXAMPLES.md` - Usage examples
- `ARCHITECTURE.md` - How it all works
- `PLATFORM_SUPPORT.md` - Platform details

## That's It!

The hard work is done. Now just test with real URLs and refine the parsers as needed. The architecture is solid and extensible.
