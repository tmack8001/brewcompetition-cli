#!/usr/bin/env python3
"""Version arithmetic for the rollback workflow.

Usage:
    npm_versions.py previous <version> <json-array-of-versions>

Prints the highest released version strictly below <version>, ignoring
pre-releases. Exits non-zero when there is no earlier version to fall back to.
"""

from __future__ import annotations

import json
import sys


def key(version: str) -> tuple[int, ...]:
    return tuple(int(part) for part in version.split('.'))


def main() -> None:
    if len(sys.argv) != 4 or sys.argv[1] != 'previous':
        sys.exit(__doc__)

    target = sys.argv[2].lstrip('v')
    try:
        published = json.loads(sys.argv[3])
    except json.JSONDecodeError:
        sys.exit('Could not parse the version list from npm')

    if isinstance(published, str):
        published = [published]

    stable = [v for v in published if '-' not in v and v.count('.') == 2]
    earlier = sorted((v for v in stable if key(v) < key(target)), key=key)

    if not earlier:
        sys.exit(f'No released version below {target}; cannot demote the latest tag')

    print(earlier[-1])


if __name__ == '__main__':
    main()
