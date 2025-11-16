# Frequently Asked Questions (FAQ)

## General Questions

### What is Brew Competition CLI?

Brew Competition CLI is a command-line tool that extracts medal winners and competition metadata from homebrew competition websites. It supports multiple competition platforms and provides a unified interface for accessing results.

### Which competition platforms are supported?

Currently supported platforms:
- **BCOEM** (Brew Competition Online Entry Management) - Full support
- **Reggie** - Results parsing
- **BAP** (Beer Awards Platform) - Results parsing

The tool automatically detects which platform to use based on the URL.

### Is this tool free to use?

Yes! Brew Competition CLI is open source and released under the MIT License. It's completely free to use, modify, and distribute.

### Do I need to know how to code to use this?

No coding knowledge is required to use the tool. Basic command-line familiarity is helpful, but the tool is designed to be user-friendly with simple commands.

## Installation Questions

### What are the system requirements?

- Node.js version 18.0.0 or higher
- npm or yarn package manager
- Internet connection (for fetching competition results)

### How do I install the tool?

```bash
npm install -g brewcompetition-cli
```

Or install from source:
```bash
git clone https://github.com/tmack8001/brewcompetition-cli.git
cd brewcompetition-cli
npm install
npm run build
npm link
```

### How do I update to the latest version?

```bash
npm update -g brewcompetition-cli
```

### Can I use this on Windows/Mac/Linux?

Yes! The tool works on all major operating systems that support Node.js.

## Usage Questions

### How do I find my medals from a competition?

```bash
brewcompetition medals <competition-url> --brewers "Your Name"
```

Replace `<competition-url>` with the actual competition results URL.

### Can I search for multiple brewers at once?

Yes! Use comma-separated names:

```bash
brewcompetition medals <url> --brewers "John Doe,Jane Smith,Bob Jones"
```

### How do I export results to a spreadsheet?

Use CSV output and redirect to a file:

```bash
brewcompetition medals <url> --output csv > results.csv
```

Then open `results.csv` in Excel, Google Sheets, or any spreadsheet application.

### Can I track multiple competitions at once?

Yes! Create a config file:

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
brewcompetition medals --file config.json
```

### What does the Entry Count column mean?

Entry Count shows the total number of entries in each category. This helps you understand how competitive the category was:
- 30+ entries = highly competitive
- 10-29 entries = moderate competition
- 1-9 entries = smaller category

### Why am I not seeing any results?

Common reasons:
1. **Filters too restrictive**: Try without `--brewers` or `--club` flags first
2. **Name mismatch**: Ensure brewer/club names match exactly as they appear in results
3. **Results not published**: Competition may not have published results yet
4. **Wrong URL**: Verify you're using the results page URL

### Can I get competition metadata like registration dates?

Yes, for BCOEM competitions:

```bash
brewcompetition competitions <bcoem-url>
```

Metadata parsing for Reggie and BAP is planned for future releases.

## Technical Questions

### How does the tool detect which platform to use?

The tool examines the URL hostname:
- `reggiebeer.com` → Reggie parser
- `beerawardsplatform.com` → BAP parser
- Everything else → BCOEM parser (default)

### Does the tool store my data?

The tool uses local caching for performance but doesn't store personal data. All data comes directly from public competition results pages.

### Can I use this tool offline?

No, the tool requires an internet connection to fetch competition results. However, you can save HTML files locally and parse them (for development/testing purposes).

### Is my competition data private?

The tool only accesses publicly available competition results pages. It doesn't access private or restricted data.

### How fast is the tool?

Very fast! Most competitions are processed in under 2 seconds. Batch processing multiple competitions happens in parallel for maximum speed.

## Troubleshooting

### I'm getting "Table not found" errors

This usually means:
1. The HTML structure differs from expected
2. Results haven't been published yet
3. The URL is incorrect

Try accessing the URL in a browser first to verify results are available.

### The wrong platform is being detected

The tool detects platforms by URL hostname. If detection is wrong:
1. Verify the URL is correct
2. Check if it's a known platform
3. BCOEM is used as the default for unknown platforms

### I'm getting network errors

Check:
1. Internet connection is working
2. Competition URL is accessible in a browser
3. No firewall blocking the requests
4. Competition site isn't experiencing downtime

### Results are missing some data

Some platforms don't provide all information:
- Entry counts may not be available on all platforms
- Club names may be optional
- Some fields may be empty in the source data

### How do I report a bug?

1. Check [existing issues](https://github.com/tmack8001/brewcompetition-cli/issues)
2. If not found, [create a new issue](https://github.com/tmack8001/brewcompetition-cli/issues/new)
3. Include:
   - Competition URL (if applicable)
   - Command you ran
   - Error message
   - Your environment (OS, Node version)

## Contributing Questions

### How can I contribute?

See the [Contributing Guide](../CONTRIBUTING.md) for detailed instructions. Contributions can include:
- Bug reports
- Feature requests
- Code contributions
- Documentation improvements
- Testing

### Can I add support for a new platform?

Absolutely! The tool is designed to be extensible. See [Contributing Guide - Adding a New Platform](../CONTRIBUTING.md#adding-a-new-platform) for step-by-step instructions.

### Do I need to be an expert programmer?

No! Contributions of all levels are welcome:
- Documentation improvements
- Bug reports
- Testing
- Feature suggestions
- Code contributions

### How long does it take to add a new platform?

For someone familiar with the codebase:
- Simple platform: 2-4 hours
- Complex platform: 1-2 days

This includes parser implementation, tests, and documentation.

## Feature Requests

### Will you add support for platform X?

Possibly! Open a [feature request](https://github.com/tmack8001/brewcompetition-cli/issues/new?template=feature_request.md) with:
- Platform name and URL
- Example competition
- Why it would be useful

### Can you add feature Y?

Feature requests are welcome! Open an issue describing:
- What you want to do
- Why it would be useful
- How you envision it working

### When will metadata parsing be added for Reggie/BAP?

This is planned for a future release. The timeline depends on:
- Community demand
- Contributor availability
- Platform API stability

## Advanced Usage

### Can I use this in a script?

Yes! The tool is designed for scripting:

```bash
#!/bin/bash
for url in $(cat competitions.txt); do
  brewcompetition medals "$url" --brewers "Your Name" --output json >> all-results.json
done
```

### Can I integrate this with other tools?

Yes! The JSON output is designed for programmatic processing:

```bash
brewcompetition medals <url> --output json | jq '.[] | .[] | select(.Place == "1st")'
```

### Can I run this as a web service?

The CLI is designed for command-line use, but you could wrap it in a web service. Consider:
- Rate limiting
- Caching
- Error handling
- Security considerations

### Can I use this for commercial purposes?

Yes! The MIT License allows commercial use. See [LICENSE](../LICENSE) for details.

## Still Have Questions?

- Check the [documentation](INDEX.md)
- Search [existing issues](https://github.com/tmack8001/brewcompetition-cli/issues)
- Open a [new issue](https://github.com/tmack8001/brewcompetition-cli/issues/new)
- Read the [Contributing Guide](../CONTRIBUTING.md)

We're here to help! 🍺
