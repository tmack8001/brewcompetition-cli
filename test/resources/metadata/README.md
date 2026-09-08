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

## What differs between the builds

**Anchor build.** Each section is introduced by an empty anchor whose `name` is
the section heading lowercased with spaces replaced by hyphens, emitted by
`sections/entry_info.sec.php`:

```php
$anchor_name = str_replace(" ", "-", $label_entry_registration);
sprintf("<a class=\"anchor-offset\" name=\"%s\"></a><h2>%s</h2>", strtolower($anchor_name), $label_entry_registration);
```

Because the anchor is derived from a *translated* label, a non-English install
produces entirely different anchor names. Account Registration is the one
exception — its anchor is hardcoded as `reg_window`.

**Landing-page build.** Content is grouped into
`<section class="landing-page-section">` blocks, each subsection wrapped in
`<div class="reveal-element">`. Anchors are present but unreliable: the same
`name="judging-sessions"` is emitted before Drop-Off Locations, Shipping Info
*and* Awards Ceremony, because `$anchor_name` is not reset between sections.
Headings also carry inline status — `<h2>Entry Registration is <span
class="text-success">Open</a></h2>`.

Only the `<h2>` text is dependable across both, which is why the parser matches
on headings first and falls back to anchors.

## Sections are conditional

Do not assume a fixture contains every section. `entry_info.sec.php` gates
several on competition state, so a closed competition legitimately has fewer:

- Entry Acceptance Rules: only when the drop-off or shipping window is not yet closed
- Shipping Info: only when shipping is enabled and its window is not yet closed
- Drop-off: heading is `Entry Delivery` for a single location, `Drop-Off Locations` for several

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
