#!/usr/bin/env python3
"""Changelog operations for the release workflow.

Kept out of the workflow YAML because changelog text must never reach a shell:
interpolating it into a `run:` block lets any backtick in it execute as a command
substitution, which is how the tag-triggered release workflow failed on v1.1.0.

Usage:
    changelog.py check                # fail if [Unreleased] has nothing real
    changelog.py roll <version>       # [Unreleased] -> [<version>] - today
    changelog.py notes <version>      # print that version's notes to stdout, reflowed
"""

from __future__ import annotations

import datetime as dt
import pathlib
import re
import sys

CHANGELOG = pathlib.Path('CHANGELOG.md')
PLACEHOLDER_SECTION = re.compile(r'^### \w+\s*\n\s*-\s*$')
SECTION_ORDER = ['Added', 'Changed', 'Deprecated', 'Removed', 'Fixed', 'Security']


def read() -> str:
    if not CHANGELOG.exists():
        sys.exit('CHANGELOG.md not found')
    return CHANGELOG.read_text()


def section_bounds(text: str, heading: str) -> tuple[int, int]:
    """Offsets of one `## [...]` block, from its heading to the next one."""
    start = text.find(f'## [{heading}]')
    if start == -1:
        sys.exit(f'No "## [{heading}]" section in CHANGELOG.md')

    nxt = text.find('\n## [', start + 1)
    return start, len(text) if nxt == -1 else nxt + 1


def unreleased_entries(body: str) -> list[str]:
    """Real bullet lines, ignoring the bare `-` placeholders the template carries."""
    return [line for line in body.splitlines() if line.startswith('- ') and line.strip() != '-']


def cmd_check() -> None:
    text = read()
    start, end = section_bounds(text, 'Unreleased')
    entries = unreleased_entries(text[start:end])

    if not entries:
        sys.exit(
            'Nothing to release: [Unreleased] contains no entries.\n'
            'Add them under ### Added / Changed / Removed / Fixed before dispatching a release.'
        )

    print(f'[Unreleased] has {len(entries)} entr{"y" if len(entries) == 1 else "ies"}')


def cmd_roll(version: str) -> None:
    text = read()
    if f'## [{version}]' in text:
        sys.exit(f'CHANGELOG.md already has a [{version}] section')

    start, end = section_bounds(text, 'Unreleased')
    body = text[start:end]

    # Drop placeholder-only sections so the release notes carry no empty headings.
    kept: dict[str, str] = {}
    for match in re.finditer(r'### (\w+)\n\n(.*?)(?=\n\n### |\Z)', body, re.S):
        name, content = match.group(1), match.group(2).rstrip('\n')
        if unreleased_entries(content):
            kept[name] = content

    if not kept:
        sys.exit('Nothing to release: [Unreleased] contains only placeholders')

    released = f'## [{version}] - {dt.date.today().isoformat()}\n\n' + '\n\n'.join(
        f'### {name}\n\n{kept[name]}' for name in SECTION_ORDER if name in kept
    ) + '\n\n\n'

    fresh = (
        '## [Unreleased]\n\n'
        '### Added\n\n-\n\n'
        '### Changed\n\n-\n\n'
        '### Fixed\n\n-\n\n\n'
    )

    CHANGELOG.write_text(text[:start] + fresh + released + text[end:])
    print(f'Rolled [Unreleased] into [{version}] with sections: {", ".join(kept)}')


# Lines that always start their own block and never join the line before them.
BULLET = re.compile(r'^\s*(?:[-*+]|\d+\.)\s')
OTHER_BLOCK = re.compile(r'^(?:\s*$|#|\s*\||\s*>|\[[^\]]+\]:\s|\s*<)')
FENCE = re.compile(r'^\s*(?:```|~~~)')


def reflow(text: str) -> str:
    """Join hard-wrapped lines so each bullet or paragraph is one line.

    CHANGELOG.md is wrapped for reading in an editor, but the release page shows the
    text as written, so a bullet wrapped at 80 columns arrives as a ragged column of
    short lines. Headings, blank lines, code fences (and what is inside them), tables,
    block quotes, link references and nested bullets are left as they are; a line
    ending in two spaces or a backslash keeps its hard break.
    """
    out: list[str] = []
    current: str | None = None
    in_fence = False

    def flush() -> None:
        nonlocal current
        if current is not None:
            out.append(current)
            current = None

    for line in text.splitlines():
        if FENCE.match(line):
            flush()
            out.append(line.rstrip())
            in_fence = not in_fence
        elif in_fence:
            out.append(line)
        elif OTHER_BLOCK.match(line):
            flush()
            out.append(line.rstrip())
        else:
            hard_break = line.endswith(('  ', '\\'))
            if BULLET.match(line):
                flush()
            # A hard break keeps its trailing marker and ends the line there.
            piece = line if hard_break else line.rstrip()
            current = piece if current is None else f'{current} {piece.lstrip()}'
            if hard_break:
                flush()

    flush()
    return '\n'.join(out)


def cmd_notes(version: str) -> None:
    text = read()
    start, end = section_bounds(text, version)
    body = text[start:end]

    # Strip the version heading; the release page supplies its own title.
    body = re.sub(r'^## \[[^\]]+\][^\n]*\n', '', body, count=1)
    sys.stdout.write(reflow(body.strip()) + '\n')


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)

    command, args = sys.argv[1], sys.argv[2:]

    if command == 'check':
        cmd_check()
    elif command == 'roll' and args:
        cmd_roll(args[0])
    elif command == 'notes' and args:
        cmd_notes(args[0])
    else:
        sys.exit(__doc__)


if __name__ == '__main__':
    main()
