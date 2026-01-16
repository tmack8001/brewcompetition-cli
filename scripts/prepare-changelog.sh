#!/bin/sh

# Prepare CHANGELOG.md for a new release
# Usage: ./scripts/prepare-changelog.sh [version]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get version from argument or calculate it
if [ -n "$1" ]; then
  NEW_VERSION=$1
else
  echo "${YELLOW}No version specified. What type of release?${NC}"
  echo "1) patch (bug fixes)"
  echo "2) minor (new features)"
  echo "3) major (breaking changes)"
  read -p "Enter choice (1-3): " -n 1 -r
  echo
  
  CURRENT_VERSION=$(node -p "require('./package.json').version")
  
  case $REPLY in
    1)
      NEW_VERSION=$(node -p "
        const v = '$CURRENT_VERSION'.split('.');
        v[2] = parseInt(v[2]) + 1;
        v.join('.');
      ")
      ;;
    2)
      NEW_VERSION=$(node -p "
        const v = '$CURRENT_VERSION'.split('.');
        v[1] = parseInt(v[1]) + 1;
        v[2] = 0;
        v.join('.');
      ")
      ;;
    3)
      NEW_VERSION=$(node -p "
        const v = '$CURRENT_VERSION'.split('.');
        v[0] = parseInt(v[0]) + 1;
        v[1] = 0;
        v[2] = 0;
        v.join('.');
      ")
      ;;
    *)
      echo "${RED}Invalid choice${NC}"
      exit 1
      ;;
  esac
fi

echo "Preparing CHANGELOG.md for version ${GREEN}$NEW_VERSION${NC}"
echo ""

# Check if version already exists
if grep -q "## \[$NEW_VERSION\]" CHANGELOG.md; then
  echo "${YELLOW}Warning: Version $NEW_VERSION already exists in CHANGELOG.md${NC}"
  read -p "Continue anyway? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

# Get today's date
TODAY=$(date +%Y-%m-%d)

# Create new version section
NEW_SECTION="## [$NEW_VERSION] - $TODAY

### Added

- 

### Changed

- 

### Fixed

- 

"

# Find the line number of [Unreleased] section
UNRELEASED_LINE=$(grep -n "## \[Unreleased\]" CHANGELOG.md | cut -d: -f1)

if [ -z "$UNRELEASED_LINE" ]; then
  echo "${RED}Error: Could not find [Unreleased] section in CHANGELOG.md${NC}"
  exit 1
fi

# Insert new section after [Unreleased] section (skip a few lines for the content)
# Find the next ## heading after [Unreleased]
NEXT_SECTION_LINE=$(tail -n +$((UNRELEASED_LINE + 1)) CHANGELOG.md | grep -n "^## \[" | head -1 | cut -d: -f1)

if [ -z "$NEXT_SECTION_LINE" ]; then
  # No next section found, append to end
  echo "$NEW_SECTION" >> CHANGELOG.md
else
  # Insert before the next section
  INSERT_LINE=$((UNRELEASED_LINE + NEXT_SECTION_LINE))
  
  # Create temp file with new content
  head -n $((INSERT_LINE - 1)) CHANGELOG.md > CHANGELOG.md.tmp
  echo "$NEW_SECTION" >> CHANGELOG.md.tmp
  tail -n +$INSERT_LINE CHANGELOG.md >> CHANGELOG.md.tmp
  mv CHANGELOG.md.tmp CHANGELOG.md
fi

echo "${GREEN}✓ Added version $NEW_VERSION section to CHANGELOG.md${NC}"
echo ""
echo "Next steps:"
echo "  1. Edit CHANGELOG.md and fill in the changes"
echo "  2. Remove empty sections (Added/Changed/Fixed) if not needed"
echo "  3. Run: npm run release $VERSION_TYPE"
echo ""
echo "Opening CHANGELOG.md..."

# Try to open in editor (works on macOS)
if command -v open > /dev/null; then
  open CHANGELOG.md
fi
