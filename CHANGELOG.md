# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-11-15

Initial release of Brew Competition CLI - a tool for extracting medal winners from homebrew competition platforms.

### Added

- Multi-platform support (BCOEM, Reggie, BAP) with automatic detection
- Medal extraction with filtering by brewer names and club
- JSON and CSV output formats
- Config file support for batch processing
- Entry count extraction for all platforms
- Competition metadata parsing (BCOEM only)

### Features

- `brewcompetition medals <url>` - Extract medal winners
- `brewcompetition competitions <url>` - Extract competition metadata
- Filter by `--brewers` or `--club`
- Export with `--output json` or `--output csv`
- Batch process with `--file config.json`

---

## [Unreleased]

No unreleased changes yet.

[Unreleased]: https://github.com/tmack8001/brewcompetition-cli/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/tmack8001/brewcompetition-cli/releases/tag/v1.0.0
