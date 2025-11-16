# Documentation Index

Welcome to the Brew Competition CLI documentation. This index will help you find the information you need.

## Getting Started

Start here if you're new to the tool:

1. **[README](../README.md)** - Project overview and installation
2. **[Quick Start Guide](QUICK_START.md)** - Get up and running in minutes
3. **[Usage Examples](EXAMPLES.md)** - Common use cases and workflows
4. **[Project Summary](PROJECT_SUMMARY.md)** - Comprehensive project overview

## User Guides

For day-to-day usage:

- **[FAQ](FAQ.md)** - Frequently asked questions and answers
  - General questions
  - Installation help
  - Usage tips
  - Troubleshooting
  - Contributing questions

- **[Usage Examples](EXAMPLES.md)** - Comprehensive examples for all features
  - Basic usage
  - Filtering results
  - Output formats
  - Config files
  - Real-world workflows

- **[Platform Support](PLATFORM_SUPPORT.md)** - Supported competition platforms
  - BCOEM (full support)
  - Reggie (results parsing)
  - BAP (results parsing)
  - Platform detection
  - Future enhancements

## Technical Documentation

For developers and contributors:

- **[Architecture Overview](ARCHITECTURE.md)** - System design and structure
  - System flow diagram
  - Directory structure
  - Key interfaces
  - Design decisions
  - Extension points

- **[Testing Guide](TESTING_GUIDE.md)** - Testing and debugging
  - Quick test commands
  - Debugging parser issues
  - Unit testing
  - Integration testing
  - Troubleshooting

## Platform Implementation Details

Deep dives into each platform parser:

- **[BCOEM Implementation](BCOEM_IMPLEMENTATION.md)** - Traditional HTML parsing
  - HTML structure
  - Parsing strategy
  - Metadata extraction
  - Date handling
  - Entry count extraction

- **[Reggie Implementation](REGGIE_IMPLEMENTATION.md)** - JavaScript data extraction
  - Dual-mode parsing
  - JavaScript data format
  - HTML fallback
  - Entry count extraction
  - Medal type conversion

- **[BAP Implementation](BAP_IMPLEMENTATION.md)** - API-based parsing
  - API structure
  - Two-step API process
  - HTML fallback
  - Entry count extraction
  - Competition key extraction

## Quick Reference

### Common Commands

```bash
# Fetch all medals
brewcompetition medals <url>

# Filter by brewer
brewcompetition medals <url> --brewers "Your Name"

# Filter by club
brewcompetition medals <url> --club "Your Club"

# Export to CSV
brewcompetition medals <url> --output csv

# Use config file
brewcompetition medals --file config.json

# Get competition metadata (BCOEM only)
brewcompetition competitions <url>
```

### Platform URLs

- **BCOEM**: Any BCOEM-hosted competition (default)
- **Reggie**: `https://reggiebeer.com/ReggieWeb.php?Web=XXXXXX`
- **BAP**: `https://beerawardsplatform.com/competition-name/results`

### Output Format

All parsers produce consistent output with these columns:
- Table / Category
- Place (1st, 2nd, 3rd, HM)
- Entry Count (total entries in category)
- Brewer
- Entry Name
- Style
- Club

## Contributing

Want to contribute? Check out:

1. **[Contributing Guide](../CONTRIBUTING.md)** - Complete contribution guidelines
2. **[Architecture Overview](ARCHITECTURE.md)** - Understand the system design
3. **[Testing Guide](TESTING_GUIDE.md)** - Learn how to test your changes
4. **[Platform Implementation Docs](BCOEM_IMPLEMENTATION.md)** - See how parsers work

### Adding a New Platform

Follow these steps:

1. Create a new parser class implementing `CompetitionParser` interface
2. Add platform detection logic in `platform-detector.ts`
3. Register the parser in `parser-factory.ts`
4. Add tests for the new parser
5. Document the implementation

See [Contributing Guide](../CONTRIBUTING.md#adding-a-new-platform) for detailed step-by-step instructions.

## Troubleshooting

Having issues? Check:

1. **[Testing Guide - Troubleshooting](TESTING_GUIDE.md#troubleshooting)** - Common issues and solutions
2. **[Examples - Troubleshooting](EXAMPLES.md#troubleshooting)** - Usage-related problems
3. **[GitHub Issues](https://github.com/tmack8001/brewcompetition-cli/issues)** - Report bugs or request features

## Additional Resources

- **[Changelog](../CHANGELOG.md)** - Version history and changes
- **[License](../LICENSE)** - MIT License details
- **[Contributing Guide](../CONTRIBUTING.md)** - How to contribute
- **[Code of Conduct](../CODE_OF_CONDUCT.md)** - Community guidelines
- **[Security Policy](../SECURITY.md)** - Security and vulnerability reporting

## For Maintainers

- **[Release Process](RELEASING.md)** - How to create and publish releases (includes npm commands)

## Version History

See [CHANGELOG.md](../CHANGELOG.md) for detailed version history.

Current version: **v0.0.0** - Initial release with multi-platform support

## License

This project is licensed under the MIT License. See the [LICENSE](../LICENSE) file for details.

## Support

- **GitHub Issues**: https://github.com/tmack8001/brewcompetition-cli/issues
- **Repository**: https://github.com/tmack8001/brewcompetition-cli
- **Author**: Trevor Mack (@tmack8001)
