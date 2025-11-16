# Brew Competition CLI

[![latest release](https://img.shields.io/npm/v/brewcompetition-cli.svg)](https://www.npmjs.com/package/brewcompetition-cli)
[![Build status](https://github.com/tmack8001/brewcompetition-cli/workflows/build/badge.svg)](https://github.com/tmack8001/brewcompetition-cli/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![Contributors](https://img.shields.io/github/contributors/tmack8001/brewcompetition-cli.svg)](https://github.com/tmack8001/brewcompetition-cli/contributors)


A command-line tool for fetching medal winners and competition metadata from multiple homebrew competition management platforms.

## Table of Contents

- [Features](#features)
- [Supported Platforms](#supported-platforms)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Usage](#usage)
- [Output Formats](#output-formats)
- [Platform Detection](#platform-detection)
- [Advanced Usage](#advanced-usage)
- [Architecture](#architecture)
- [Documentation](#documentation)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

## Features

- 🏆 Extract medal winners from competition results
- 📊 Support for multiple competition platforms (BCOEM, Reggie, BAP)
- 🔍 Filter results by brewer names or club
- 📁 Batch processing with config files
- 📤 Export to JSON or CSV formats
- 🎯 Automatic platform detection based on URL

## Supported Platforms

| Platform | Status | Features |
|----------|--------|----------|
| **BCOEM** | ✅ Full support | Medal results, competition metadata |
| **Reggie** | ✅ Results only | Medal results parsing |
| **BAP** | ✅ Results only | Medal results parsing via API |

The CLI automatically detects which platform to use based on the competition URL.

## Installation

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

## Quick Start

### Fetch all medal winners from a competition

```bash
brewcompetition medals https://reggiebeer.com/ReggieWeb.php?Web=1000882
```

### Filter by specific brewers

```bash
brewcompetition medals <url> --brewers "John Doe,Jane Smith"
```

### Filter by club

```bash
brewcompetition medals <url> --club "My Homebrew Club"
```

### Export to CSV

```bash
brewcompetition medals <url> --output csv > results.csv
```

## Usage

### Commands

#### `medals`

Extract medal winners from competition results.

```bash
brewcompetition medals <url> [options]
```

**Options:**
- `-b, --brewers <names>` - Filter by specific brewer names (comma-separated)
- `-c, --club <name>` - Filter by club name
- `-o, --output <format>` - Output format: `json` (default) or `csv`
- `-f, --file <path>` - Use a config file for batch processing
- `-h, --help` - Show help

**Examples:**

```bash
# BCOEM competition
brewcompetition medals https://example-bcoem.com/results

# Reggie competition
brewcompetition medals https://reggiebeer.com/ReggieWeb.php?Web=1000882

# BAP competition
brewcompetition medals https://beerawardsplatform.com/2025-ash-copper-state-cup/results

# With filters
brewcompetition medals <url> --brewers "John Doe" --club "Homebrew Club" --output csv
```

#### `competitions`

Fetch competition metadata (BCOEM only).

```bash
brewcompetition competitions <url>
```

Returns information about registration dates, entry deadlines, drop-off windows, and awards ceremony details.

### Config File Usage

For tracking multiple competitions, create a JSON config file:

```json
{
  "brewers": ["John Doe", "Jane Smith"],
  "club": "My Homebrew Club",
  "competitions": [
    "https://example-bcoem.com/results",
    "https://reggiebeer.com/ReggieWeb.php?Web=1000882",
    "https://beerawardsplatform.com/2025-ash-copper-state-cup/results"
  ]
}
```

Then run:

```bash
brewcompetition medals --file my-competitions.json --output json
```

## Output Formats

### JSON (default)

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

### CSV

```
Table / Category|Place|Entry Count|Brewer|Entry Name|Style|Club
01: Light Lager|1st|12|John Doe|Crisp Lager|1A American Light Lager|Homebrew Club
```

### Understanding Entry Count

The Entry Count column shows the total number of entries in each category, helping you understand how competitive each category was:

- **High competition** (30+ entries): Winning here is a significant achievement
- **Medium competition** (10-29 entries): Solid competition level
- **Low competition** (1-9 entries): Smaller category

This information is automatically extracted from all supported platforms and included in both JSON and CSV outputs.

## Platform Detection

The tool automatically detects the platform based on the URL hostname:

- URLs containing `reggiebeer.com` → Reggie parser
- URLs containing `beerawardsplatform.com` → BAP parser
- All other URLs → BCOEM parser (default)

## Advanced Usage

### Pipe to jq for JSON processing

```bash
# Get only gold medals
brewcompetition medals <url> --output json | jq '.[] | .[] | select(.Place == "1st")'

# Count total medals
brewcompetition medals <url> --output json | jq '[.[] | .[]] | length'
```

### Process multiple competitions

```bash
for url in \
  "https://reggiebeer.com/ReggieWeb.php?Web=1000882" \
  "https://beerawardsplatform.com/2025-ash-copper-state-cup/results"
do
  brewcompetition medals "$url" --brewers "Your Name" --output csv >> all-results.csv
done
```

## Architecture

The tool uses a modular parser factory pattern:

```
User Input → Command Layer → Parser Factory → Platform Parser → Output
```

- **Platform Detection**: Analyzes URL hostname to determine platform
- **Parser Factory**: Returns appropriate parser for detected platform
- **Platform Parsers**: Each platform has its own parser implementing a common interface

See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed architecture documentation.

## Documentation

📚 **[Complete Documentation Index](docs/INDEX.md)** - Start here for all documentation

### Quick Links

- **[Quick Start Guide](docs/QUICK_START.md)** - Get up and running in minutes
- **[FAQ](docs/FAQ.md)** - Frequently asked questions
- **[Usage Examples](docs/EXAMPLES.md)** - Comprehensive examples and workflows
- **[Platform Support](docs/PLATFORM_SUPPORT.md)** - Supported platforms and features
- **[Testing Guide](docs/TESTING_GUIDE.md)** - Testing and debugging

### Technical Documentation

- **[Architecture Overview](docs/ARCHITECTURE.md)** - System design and structure
- **[BCOEM Implementation](docs/BCOEM_IMPLEMENTATION.md)** - Traditional HTML parsing
- **[Reggie Implementation](docs/REGGIE_IMPLEMENTATION.md)** - JavaScript data extraction
- **[BAP Implementation](docs/BAP_IMPLEMENTATION.md)** - API-based parsing

## Development

### Build

```bash
npm run build
```

### Test

```bash
npm test
```

### Lint

```bash
npm run lint
```

## Requirements

- Node.js >= 18.0.0
- npm or yarn package manager

## Contributing

Contributions are welcome! We'd love your help making this tool better.

### Quick Start for Contributors

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a Pull Request

See **[CONTRIBUTING.md](CONTRIBUTING.md)** for detailed guidelines including:
- Development setup
- Coding standards
- Testing requirements
- How to add a new platform
- Documentation guidelines

### Adding a New Platform

The tool is designed to be easily extensible. To add support for a new competition platform:

1. Create a parser implementing the `CompetitionParser` interface
2. Add platform detection logic
3. Register the parser in the factory
4. Add tests and documentation

See [CONTRIBUTING.md](CONTRIBUTING.md#adding-a-new-platform) for step-by-step instructions.

## License

MIT

## Author

Trevor Mack (@tmack8001)

## Links

- [GitHub Repository](https://github.com/tmack8001/brewcompetition-cli)
- [Issue Tracker](https://github.com/tmack8001/brewcompetition-cli/issues)
