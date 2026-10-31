# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

-

### Changed

- Release notes join wrapped changelog lines, so each entry is one line on the release page.

### Fixed

-


## [1.2.0] - 2026-10-27

Fixes missing Best of Show results on BAP, makes club and brewer matching ignore case and diacritics, and adds release and rollback workflows.

### Added

- `Release` and `Rollback release` workflows (GitHub Actions)

### Changed

- Minimum Node.js is now 20.18.1 (Node 20 is end of life); CI tests Node 22, 24 and 26
- `--club` and `--brewers` ignore case and diacritics, so `The Bru Club` finds `The Brü Club`
- Platform detection matches `beerawardsplatform.com` and `reggiebeer.com` by domain, not substring
- Dev tooling: `tsx` replaces `ts-node`, ESLint 10, TypeScript 6, updated dependencies

### Removed

- Unused dependencies: `node-persist`, `json2csv`, `node-localstorage`, `shx`

### Fixed

- BAP: `medals` now includes Best of Show and custom awards such as `Best of Show - Mead & Cider`
- BAP: an award line that cannot be read is skipped with a warning instead of failing the run
- BAP: bare competition URLs work, and `N Entries` in a category name fills in `Entry Count`
- BCOEM: results parsing no longer depends on CSS class names; Best of Show tables on newer builds are included
- BCOEM: `--brewers` matches entries that have a co-brewer
- A fresh `npm install` no longer crashes on load (`cheerio` has no default export)
- `medals` exits non-zero when a competition cannot be read


## [1.1.0] - 2026-09-13

Makes the CLI work against competition sites behind bot protection, and fixes a long list of BCOEM date and metadata parsing problems.

### Added

- Retry with browser impersonation (Chrome, then Firefox) for sites behind bot protection such as Cloudflare
- `BotChallengeError` listing the strategies tried when a site cannot be reached

### Changed

- Minimum Node.js is now 20 (Node 18 is end of life)
- `competitions` tries `?section=entry` when the URL has no metadata, and says so when a competition publishes none
- BCOEM metadata is found by `<h2>` heading first, then the original anchors
- Requests go through the shared `fetchHtml` / `fetchJson` helpers
- Upgraded `mocha` to v11 (v10 could not start on Node 22.12+)

### Removed

- `src/bcoem.ts`, the unused pre-refactor BCOEM implementation

### Fixed

- Only a real bot challenge triggers impersonation; 404s, 500s, DNS failures and refused connections are reported as themselves
- Requests time out instead of hanging, and a connection reset retries with a browser fingerprint
- `fetchJson` no longer passes a non-JSON body through as the payload
- `|` in competition text no longer shifts the output columns, and dates are ISO-8601
- BCOEM dates: all date and time formats are read (non-English installs gave empty dates)
- BCOEM dates: `12:00 AM` is no longer read as midday, and both ends of a window are read
- BCOEM time zones: an unknown abbreviation yields no date instead of the host zone
- BCOEM time zones: standard abbreviations (EST, CST, MST, PST) no longer shift in summer, and `-03`-style stamps are accepted
- BCOEM: the awards ceremony is read as a moment, so words like "Deadline" in a venue name do not move it
- BCOEM: the bottle requirement is read only from its own labelled text
- BCOEM: metadata is found on newer "landing page" builds and when a heading is not rendered
- BCOEM: a section no longer picks up text from the next one
- `competitions` no longer gives up when the first URL fails or one section has no dates
- A missing `impit` binary reports one clear line


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
