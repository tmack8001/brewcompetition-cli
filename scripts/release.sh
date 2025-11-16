#!/bin/sh

# Release script for brewcompetition-cli
# Usage: ./scripts/release.sh [patch|minor|major]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if version type is provided
if [ -z "$1" ]; then
  echo "${RED}Error: Version type required${NC}"
  echo "Usage: ./scripts/release.sh [patch|minor|major]"
  echo ""
  echo "Examples:"
  echo "  ./scripts/release.sh patch   # 1.0.0 -> 1.0.1"
  echo "  ./scripts/release.sh minor   # 1.0.0 -> 1.1.0"
  echo "  ./scripts/release.sh major   # 1.0.0 -> 2.0.0"
  exit 1
fi

VERSION_TYPE=$1

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
  echo "${GREEN}Release v$NEW_VERSION complete!${NC}"
  echo ""
  echo "Next steps:"
  echo "  1. GitHub Actions will create a release automatically"
  echo "  2. Review the release at: https://github.com/tmack8001/brewcompetition-cli/releases"
  echo "  3. Publish to npm: npm publish"
else
  echo "${YELLOW}Skipped push. You can push manually with:${NC}"
  echo "  git push origin main --tags"
fi
