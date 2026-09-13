# BCOEM metadata fixtures

Raw, unmodified page captures. BCOEM is open source
(https://github.com/geoffhumphrey/brewcompetitiononlineentry) and self-hosted,
so several generations of the software are live at once. Each fixture pins one
of them.

| Fixture | Source | Build | Competition state |
| --- | --- | --- | --- |
| `bcoem_info.html` | captured 2025-11 | Anchor build | Closed |
| `bcoem_info_closed.html` | `dominioncup-jrhb.org/index.php?section=entry` | Anchor build | Closed — registration and entry windows both shut |
| `bcoem_info_landing.html` | `mdmicrobrewfest.brewingcompetitions.com/index.php?section=entry` | Landing-page build | Open — renders drop-off, shipping and acceptance-rules sections |
| `bcoem_info_intl_open.html` | **synthesized**, not captured | Anchor build | Open — all seven windows, non-US configuration |

`bcoem_info_intl_open.html` is the one fixture that is not a real capture. No live
anchor-build competition with open windows could be found, and every captured
anchor-build page is closed — which leaves the prose date path, the single-location
drop-off heading, and the volunteer-paragraph fallback untested. It is assembled
from upstream's own sentence templates (`lang/en/en-US.lang.php`,
`pub/entry_info.pub.php`) in a deliberately non-US configuration:
`prefsDateFormat` other than 1 (`Monday 8 June, 2026`), `prefsTimeFormat` 1
(24-hour), and a European zone. Replace it with a real capture if one turns up.

## What differs between the builds

**Anchor build.** Each section is introduced by an empty anchor whose `name` is
the section heading lowercased with spaces replaced by hyphens. The public page is
rendered by `pub/entry_info.pub.php`; the identically-named file under
`sections/` is reachable only through the admin-only `index.legacy.php`. Both
build the anchor the same way:

```php
$anchor_name = str_replace(" ", "-", $label_entry_registration);
sprintf("<a class=\"anchor-offset\" name=\"%s\"></a><h2>%s</h2>", strtolower($anchor_name), $label_entry_registration);
```

Because the anchor is derived from a *translated* label, a non-English install
produces entirely different anchor names. Account Registration is the one
exception — its anchor is hardcoded as `reg_window`.

**Landing-page build.** Content is grouped into
`<section class="landing-page-section">` blocks, each subsection wrapped in
`<div class="reveal-element">`. Anchors are present but unreliable: `$anchor_name` is
stale by the time these sections render, so the same `name="judging-sessions"`
precedes Drop-Off Locations, Shipping Info, Awards Ceremony and several others.
The anchor fallback is therefore inert on this build.
Headings also carry inline status — `<h2>Entry Registration is <span
class="text-success">Open</a></h2>`.

Only the `<h2>` text is dependable across both, which is why the parser matches
on headings first and falls back to anchors.

## Sections are conditional

Do not assume a fixture contains every section. `entry_info.pub.php` gates
several on competition state, so a closed competition legitimately has fewer:

- Entry Acceptance Rules: only when the drop-off or shipping window is not yet closed
- Shipping Info: only when shipping is enabled and its window is not yet closed
- Drop-off: heading is `Entry Delivery` for a single location, `Drop-Off Locations` for several

Nor that every install renders dates the same way. `lib/date_time.lib.php` composes
a date, a time and a zone independently, each driven by an admin preference, so the
same window appears as `Friday, August 14, 2026 12:00 AM, EDT`,
`Friday 14 August, 2026 00:00, CEST`, or `08/14/2026 12:00 AM, EDT` depending on
configuration. A numeric date is additionally ambiguous between `m/d/Y` and `d/m/Y`.

The bottle count (`Number of Bottles Required Per Entry`) is emitted into the
Entry Acceptance Rules body but *outside* the guard that renders its heading,
so on a closed competition it detaches and trails whichever section came
before. The parser therefore looks for it across the whole page.

## Refreshing a fixture

Captures are raw responses, so they can be refreshed with the CLI's own fetch
layer:

```bash
node -e "import('./dist/http/fetch.js').then(async ({fetchHtml}) => \
  process.stdout.write(await fetchHtml('https://example.brewingcompetitions.com/index.php?section=entry')))" \
  > test/resources/metadata/bcoem_info_landing.html
```

Prefer adding a new fixture over refreshing an old one — the point of these
files is to keep the older builds covered as live sites move on.
