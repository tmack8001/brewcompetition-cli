#!/bin/sh

# Release script for brewcompetition-cli
# Usage: ./scripts/release.sh [patch|minor|major] [--publish]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Parse arguments
PUBLISH=false
VERSION_TYPE=""

for arg in "$@"; do
  case $arg in
    --publish)
      PUBLISH=true
      shift
      ;;
    patch|minor|major)
      VERSION_TYPE=$arg
      shift
      ;;
    *)
      echo "${RED}Error: Unknown argument '$arg'${NC}"
      exit 1
      ;;
  esac
done

# Check if version type is provided
if [ -z "$VERSION_TYPE" ]; then
  echo "${RED}Error: Version type required${NC}"
  echo "Usage: ./scripts/release.sh [patch|minor|major] [--publish]"
  echo ""
  echo "Examples:"
  echo "  ./scripts/release.sh patch            # 1.0.0 -> 1.0.1"
  echo "  ./scripts/release.sh minor            # 1.0.0 -> 1.1.0"
  echo "  ./scripts/release.sh major            # 1.0.0 -> 2.0.0"
  echo "  ./scripts/release.sh patch --publish  # Release and publish to npm"
  exit 1
fi

# Validate version type
if [ "$VERSION_TYPE" != "patch" ] && [ "$VERSION_TYPE" != "minor" ] && [ "$VERSION_TYPE" != "major" ]; then
  echo "${RED}Error: Invalid version type '$VERSION_TYPE'${NC}"
  echo "Must be one of: patch, minor, major"
  exit 1
fi

echo "${YELLOW}Starting release process for $VERSION_TYPE version...${NC}"
echo ""

# Check for uncommitted changes
if ! git diff-index --quiet HEAD --; then
  echo "${RED}Error: You have uncommitted changes${NC}"
  echo "Please commit or stash your changes before releasing"
  exit 1
fi

# Check if on main branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
  echo "${YELLOW}Warning: You are not on the main branch (current: $CURRENT_BRANCH)${NC}"
  read -p "Continue anyway? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

# Run tests
echo "${YELLOW}Running tests...${NC}"
npm test
if [ $? -ne 0 ]; then
  echo "${RED}Tests failed. Aborting release.${NC}"
  exit 1
fi
echo "${GREEN}✓ Tests passed${NC}"
echo ""

# Build
echo "${YELLOW}Building project...${NC}"
npm run build
if [ $? -ne 0 ]; then
  echo "${RED}Build failed. Aborting release.${NC}"
  exit 1
fi
echo "${GREEN}✓ Build successful${NC}"
echo ""

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "Current version: ${YELLOW}$CURRENT_VERSION${NC}"

# Calculate what the new version will be
case $VERSION_TYPE in
  patch)
    NEW_VERSION=$(node -p "
      const v = require('./package.json').version.split('.');
      v[2] = parseInt(v[2]) + 1;
      v.join('.');
    ")
    ;;
  minor)
    NEW_VERSION=$(node -p "
      const v = require('./package.json').version.split('.');
      v[1] = parseInt(v[1]) + 1;
      v[2] = 0;
      v.join('.');
    ")
    ;;
  major)
    NEW_VERSION=$(node -p "
      const v = require('./package.json').version.split('.');
      v[0] = parseInt(v[0]) + 1;
      v[1] = 0;
      v[2] = 0;
      v.join('.');
    ")
    ;;
esac

echo "New version will be: ${GREEN}$NEW_VERSION${NC}"
echo ""

# Check if CHANGELOG.md has been updated
echo "${YELLOW}Checking CHANGELOG.md...${NC}"
if ! grep -q "## \[$NEW_VERSION\]" CHANGELOG.md; then
  echo "${RED}Error: CHANGELOG.md does not contain an entry for version $NEW_VERSION${NC}"
  echo ""
  echo "Please update CHANGELOG.md with the changes for this release:"
  echo ""
  echo "## [$NEW_VERSION] - $(date +%Y-%m-%d)"
  echo ""
  echo "### Added"
  echo "- New features..."
  echo ""
  echo "### Changed"
  echo "- Changes..."
  echo ""
  echo "### Fixed"
  echo "- Bug fixes..."
  echo ""
  exit 1
fi
echo "${GREEN}✓ CHANGELOG.md contains entry for v$NEW_VERSION${NC}"
echo ""

# Check if [Unreleased] section is empty or has content
if grep -A 5 "## \[Unreleased\]" CHANGELOG.md | grep -q "^### "; then
  echo "${YELLOW}Warning: [Unreleased] section still has content${NC}"
  echo "Consider moving unreleased changes to the v$NEW_VERSION section"
  echo ""
  read -p "Continue anyway? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

# Bump version
echo "${YELLOW}Bumping $VERSION_TYPE version...${NC}"

case $VERSION_TYPE in
  patch)
    npm version patch -m "prepare release %s"
    ;;
  minor)
    npm version minor -m "prepare release %s"
    ;;
  major)
    npm version major -m "prepare release %s"
    ;;
esac

# Get new version
NEW_VERSION=$(node -p "require('./package.json').version")
echo "${GREEN}✓ Version bumped to $NEW_VERSION${NC}"
echo ""

# Show what will be pushed
echo "${YELLOW}Ready to push:${NC}"
echo "  - Commit with version bump"
echo "  - Tag: v$NEW_VERSION"
echo ""

# Ask for confirmation
read -p "Push to origin? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo "${YELLOW}Pushing to origin...${NC}"
  git push origin main --tags
  echo "${GREEN}✓ Pushed successfully${NC}"
  echo ""
  
  # Publish to npm if --publish flag is set
  if [ "$PUBLISH" = true ]; then
    echo "${YELLOW}Publishing to npm...${NC}"
    echo ""
    
    # Check if logged in to npm
    if ! npm whoami > /dev/null 2>&1; then
      echo "${RED}Error: Not logged in to npm${NC}"
      echo "Run 'npm login' first"
      exit 1
    fi
    
    echo "Logged in as: $(npm whoami)"
    echo ""
    read -p "Publish to npm? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      npm publish --access public
      echo ""
      echo "${GREEN}✓ Published to npm successfully${NC}"
      echo ""
      echo "Verify at: https://www.npmjs.com/package/brewcompetition-cli"
    else
      echo "${YELLOW}Skipped npm publish${NC}"
    fi
  fi
  
  echo "${GREEN}Release v$NEW_VERSION complete!${NC}"
  echo ""
  echo "Next steps:"
  echo "  1. GitHub Actions will create a release automatically"
  echo "  2. Review the release at: https://github.com/tmack8001/brewcompetition-cli/releases"
  if [ "$PUBLISH" = false ]; then
    echo "  3. Publish to npm: npm publish --access public"
  fi
else
  echo "${YELLOW}Skipped push. You can push manually with:${NC}"
  echo "  git push origin main --tags"
fi
