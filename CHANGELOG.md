# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security

-

### Added

- Automatic browser impersonation fallback for competition sites behind bot
  protection (Cloudflare, Hostinger CDN). Requests that come back as a
  "Just a moment..." / "Enable JavaScript and cookies" interstitial are
  retried with a Chrome, then Firefox, TLS fingerprint via `impit`.
- `BotChallengeError` with the list of attempted strategies, so a site that
  genuinely cannot be reached reports why instead of failing to parse.

### Changed

- Minimum supported Node.js version raised from 18 to 20 (`impit` requires
  Node 20+; Node 18 reached end of life in April 2025).
- Upgraded `mocha` from v10 to v11. mocha 10 pulls `yargs` 16, which cannot be
  loaded on Node 22.12+ and prevented the test suite from starting.
- HTTP requests in `medals`, `competitions`, and the BAP API client now go
  through the shared `fetchHtml`/`fetchJson` helpers instead of calling
  `axios` directly.


## [1.0.1] - 2026-01-16

### Security

- Updated `@oclif/core` from ^3 to ^4 to address js-yaml prototype pollution vulnerability
- Updated `@oclif/plugin-plugins` from ^4 to ^5 for compatibility with @oclif/core v4
- Updated `@oclif/test` from ^3 to ^4 to resolve transitive js-yaml vulnerability 

### Added

- Pre-commit git hook to run tests before commits
- `npm run install-hooks` script to install git hooks for contributors
- `npm run release` script for automated releases with better commit messages
- `scripts/release.sh` - Interactive release script with validation 

### Changed

- Updated test suite to use `@oclif/test` v4 API (`runCommand` instead of deprecated test helpers)


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

[Unreleased]: https://github.com/tmack8001/brewcompetition-cli/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/tmack8001/brewcompetition-cli/releases/tag/v1.0.1
[1.0.0]: https://github.com/tmack8001/brewcompetition-cli/releases/tag/v1.0.0
