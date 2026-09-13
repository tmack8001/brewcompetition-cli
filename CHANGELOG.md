# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

-

### Changed

-

### Fixed

-


## [1.1.0] - 2026-09-13

### Added

- Automatic browser impersonation fallback for competition sites behind bot
  protection (Cloudflare, Hostinger CDN). Requests that come back as a
  "Just a moment..." / "Enable JavaScript and cookies" interstitial are
  retried with a Chrome, then Firefox, TLS fingerprint via `impit`.
- `BotChallengeError` with the list of attempted strategies, so a site that
  genuinely cannot be reached reports why instead of failing to parse.

### Fixed

- A bot-protection retry is no longer the answer to every failure. A 404, a 500,
  a DNS failure and a refused connection are reported as themselves; only a
  response that actually looks like an interstitial triggers impersonation, and a
  bare refusal that survives every strategy is reported as its status rather than
  as a browser problem.
- `fetchJson` no longer returns a non-JSON body typed as its caller's payload.
  axios hands back the raw string rather than throwing, so an HTML error page was
  reaching the BAP parser as though it were the API response.
- Requests now carry a timeout on the direct attempt as well as the impersonated
  one, so a hanging server can no longer stall the CLI indefinitely.
- A missing `impit` native binary now reports one actionable line instead of
  embedding the loader's multi-paragraph dump in the error twice.
- A `|` in competition text no longer desynchronises the output row from its
  header. These fields are admin free-text and nothing upstream prevents one.
- Dates are emitted as ISO-8601 rather than `Date.prototype.toString()`, which
  rendered in the host machine's timezone and in no parseable format.
- All of BCOEM's date renderings are now read, not just the US default. Date
  order, 12- versus 24-hour time and the long/short forms are each independently
  configurable, so a non-English install previously yielded empty date columns for
  every window. Numeric date order is inferred from the page.
- An unrecognised timezone abbreviation now yields no date instead of the host
  machine's zone. A Sydney competition in summer was read 15 hours out. The
  abbreviation table is derived from upstream's own zone list rather than
  hand-maintained in two places that had already diverged.
- A window stating only its closing date no longer reports that date as the
  window's start. This covers the sentences an *open* competition renders, where
  BCOEM replaces the opening timestamp with the words "today" or "now" and the
  only date present is the deadline.
- The bottle requirement is no longer satisfied by prose that happens to end in a
  clock, such as "Ship bottles to arrive by 9/16 at 5:00".
- An admin-authored heading in the rules blurb can no longer outrank the real
  section it resembles.
- A standard timezone abbreviation now resolves to a zone that never leaves it, so
  an Arizona or Saskatchewan competition is no longer an hour out every summer.
- The short numeric timezone stamp PHP emits for zones without a lettered
  abbreviation (`-03`, `+08`, `+07` and others, covering 13 of the 46 zones BCOEM
  supports) is now accepted; previously every date on such a page was dropped.
- A rate-limited or transient response from one browser profile no longer stops
  the other from being tried.
- A connection reset now retries with a browser fingerprint instead of giving up.
  Some WAFs reject an unrecognised TLS fingerprint by destroying the socket rather
  than answering with a status, so a reset is a plausible fingerprint problem. DNS
  failures and refused connections are still reported as themselves.
- A failure that never reached an HTTP status is no longer reported as "status
  code 0".
- A line break in competition text becomes a space rather than gluing two lines
  together, so a venue no longer runs into its own street address.
- The readable window column is rendered in the competition's own offset for the
  19 zones BCOEM supports that have no lettered abbreviation. A fixed offset is
  not a moment-timezone zone, so these were silently rendered in the machine's own
  zone - rolling the clock and sometimes the date - with a warning on stderr.
- The awards ceremony is read as a moment rather than a window, so a cue word in
  the venue name or address no longer moves it into the closing column. Real
  venues supply them: "Deadline Brewing Parlor", "Brewery by the Bay".
- The bottle requirement is no longer taken from another section's prose. Only the
  explicitly labelled form is searched for page-wide; the looser shape is confined
  to the Entry Acceptance Rules section.
- Impersonated retries carry a shorter timeout, so a host that accepts a
  connection and never answers costs 50s rather than 90s per page.
- A window rendered without any wrapping element - which the public page does for
  judge-and-steward-only registration - is no longer skipped, and stays one
  sentence across its own inline markup so the "through" cue is not stranded from
  the date it governs.
- `competitions` no longer gives up when the first candidate URL fails to fetch,
  which is precisely the case the second candidate exists to cover.
- `competitions` no longer aborts a whole page when one section states no dates.
  A closed competition renders "Registration is closed." with no window, which
  previously threw `No date ranges found` and lost every other field.
- BCOEM metadata is now found on newer "landing page" builds, which state each
  window in an "At a Glance" card grid and emit duplicate anchors that cannot
  distinguish drop-off from shipping from awards.
- Section paragraphs no longer leak across headings. A short section used to
  absorb the following section's text, so volunteer registration could report
  the entry-registration window.
- Midnight is no longer read as midday. `12:00 AM` was parsed with a 24-hour
  format, putting every window that opens at midnight twelve hours late.
- Both dates of a window are now read. The regex required the trailing full stop
  that only terminates the closing date, so opening dates were dropped.
- Drop-off is found when a competition has a single location, where BCOEM labels
  the section `Entry Delivery` rather than `Drop-Off Locations`.
- The bottle requirement is found even when its heading is not rendered, which
  BCOEM does once the drop-off and shipping windows have closed.
- Standard-time zones (EST, CST, MST, PST) are recognised alongside daylight ones.

### Changed

- A platform whose metadata parsing is not implemented now reports that, instead of
  reporting that the competition published no metadata. Trying a second URL on the
  same site cannot help, so it is fatal rather than a candidate failure.
- `competitions` now tries `?section=entry` when the given URL publishes no
  metadata, and reports plainly when a competition publishes none at all
  (BCOEM gates the entry-info page behind a login once the windows close).
- BCOEM metadata resolution now matches on `<h2>` headings first and falls back
  to the original named anchors, which are derived from translated labels and so
  differ on non-English installs. The section prose is kept as the readable value
  - it carries the drop-off locations and shipping address that the dates alone do
  not - while the "At a Glance" cards supply the timestamps.
- Minimum supported Node.js version raised from 18 to 20 (`impit` requires
  Node 20+). Released as a minor version rather than a major one: Node 18 reached
  end of life on 2025-04-30, so it receives no security patches and nobody should
  be running the CLI on it. See the Runtime Support Policy in `docs/RELEASING.md`.
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
