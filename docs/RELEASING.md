# Release Process

This document describes how to create and publish releases of Brew Competition CLI.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Pre-Release Checklist](#pre-release-checklist)
- [Version Numbering](#version-numbering)
- [Release Steps](#release-steps)
- [Publishing to npm](#publishing-to-npm)
- [Post-Release Tasks](#post-release-tasks)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### Required Accounts

1. **npm Account**: Create at https://www.npmjs.com/signup
2. **npm Organization Access**: Must be added as maintainer to `brewcompetition-cli` package
3. **GitHub Access**: Write access to the repository

### Required Tools

```bash
# Verify Node.js version
node --version  # Should be >= 18.0.0

# Verify npm is installed
npm --version

# Login to npm (one-time setup)
npm login
```

### npm Security Changes (November 2024)

**Important updates to npm authentication:**

- ⚠️ **Classic tokens expired**: November 19, 2024
- ⚠️ **TOTP 2FA no longer supported**: Cannot add new time-based one-time password 2FA
- ✅ **Security keys required**: Must use hardware tokens or platform authenticators
- ✅ **Granular tokens**: Limited to 90 days, 2FA enforced by default

**What this means:**
- You cannot use `npm profile enable-2fa auth-and-writes` for new setups
- You must configure 2FA through the web interface
- CI/CD workflows need granular tokens (not classic tokens)

Learn more: https://gh.io/npm-token-changes

### Two-Factor Authentication

**Important**: As of November 19, 2024, npm no longer supports adding new TOTP (time-based one-time password) 2FA. You must use security keys instead.

**Setup 2FA:**

1. Visit https://www.npmjs.com/settings/YOUR_USERNAME/tfa
2. Add a security key (hardware token like YubiKey or platform authenticator)
3. 2FA is now enforced by default for all publishing operations

**Note**: The old command `npm profile enable-2fa auth-and-writes` no longer works for new setups. You must configure 2FA through the web interface.

**Token Changes:**
- Classic tokens expired November 19, 2024
- Granular tokens are now limited to 90 days with 2FA enforced by default
- Update CI/CD workflows accordingly: https://gh.io/npm-token-changes

## Pre-Release Checklist

Before creating a release, ensure:

- [ ] All tests pass: `npm test`
- [ ] Linting passes: `npm run lint`
- [ ] Build succeeds: `npm run build`
- [ ] Documentation is up to date
- [ ] CHANGELOG.md is updated with changes
- [ ] All PRs for the release are merged
- [ ] No known critical bugs
- [ ] Version number is decided

### Run Full Verification

```bash
# Clean install
rm -rf node_modules package-lock.json
npm install

# Run all checks
npm test
npm run lint
npm run build

# Test the CLI locally
npm link
brewcompetition medals <test-url> --output json
npm unlink
```

## Version Numbering

We follow [Semantic Versioning](https://semver.org/) (SemVer):

- **MAJOR.MINOR.PATCH** (e.g., 1.2.3)

### Version Types

- **MAJOR** (1.0.0 → 2.0.0): Breaking changes
  - Incompatible API changes
  - Removed features
  - Changed command syntax

- **MINOR** (1.0.0 → 1.1.0): New features (backward compatible)
  - New platform support
  - New commands or flags
  - New output formats

- **PATCH** (1.0.0 → 1.0.1): Bug fixes (backward compatible)
  - Bug fixes
  - Documentation updates
  - Performance improvements

### Pre-Release Versions

For testing before official release:

- **Alpha**: `1.0.0-alpha.1` - Early testing
- **Beta**: `1.0.0-beta.1` - Feature complete, testing
- **RC**: `1.0.0-rc.1` - Release candidate

## Release Steps

### Quick Release (Recommended)

Use the automated release script:

```bash
# For a patch release (bug fixes)
npm run release patch

# For a minor release (new features)
npm run release minor

# For a major release (breaking changes)
npm run release major
```

This script will:
- Check for uncommitted changes
- Run tests
- Build the project
- Bump the version with a descriptive commit message
- Prompt you to push to GitHub

### Manual Release

If you prefer manual control:

### 1. Update Version Number

Choose the appropriate version bump with a descriptive commit message:

```bash
# For a patch release (bug fixes)
npm version patch -m "prepare release %s"

# For a minor release (new features)
npm version minor -m "prepare release %s"

# For a major release (breaking changes)
npm version major -m "prepare release %s"

# For a pre-release
npm version prerelease --preid=beta -m "prepare release %s"
```

The `-m` flag customizes the commit message. `%s` is replaced with the new version number.
This follows Maven's convention for release commits.

This command will:
- Update `package.json` version
- Create a git commit with your custom message
- Create a git tag
- Run the `version` script (updates README.md and CHANGELOG.md)

### 2. Update CHANGELOG.md

Edit `CHANGELOG.md` to document changes:

```markdown
## [1.0.0] - 2025-01-15

### Added
- New feature X
- Support for platform Y

### Changed
- Improved performance of Z

### Fixed
- Bug in parser A
- Issue with filter B

### Breaking Changes
- Removed deprecated flag --old-flag
```

Commit the changes:

```bash
git add CHANGELOG.md
git commit --amend --no-edit
```

### 3. Push to GitHub

```bash
# Push the commit
git push origin main

# Push the tag
git push origin v1.0.0
```

### 4. Create GitHub Release

1. Go to https://github.com/tmack8001/brewcompetition-cli/releases
2. Click "Draft a new release"
3. Select the tag you just pushed (e.g., `v1.0.0`)
4. Title: `v1.0.0` (or descriptive like `v1.0.0 - Multi-Platform Support`)
5. Description: Copy relevant section from CHANGELOG.md
6. Check "Set as the latest release"
7. Click "Publish release"

## Publishing to npm

### First-Time Package Publishing

If this is the first time publishing the package:

```bash
# Ensure you're logged in
npm whoami

# Publish the package
npm publish --access public
```

### Subsequent Releases

For regular releases:

```bash
# Build and prepare
npm run build

# Publish to npm
npm publish
```

You'll be prompted for your 2FA code.

### Publishing Pre-Releases

For alpha, beta, or RC versions:

```bash
# Publish with a tag
npm publish --tag beta

# Users can install with:
# npm install brewcompetition-cli@beta
```

### Verify Publication

```bash
# Check the published version
npm view brewcompetition-cli version

# Check all versions
npm view brewcompetition-cli versions

# Test installation
npm install -g brewcompetition-cli@latest
brewcompetition --version
```

## Post-Release Tasks

### 1. Announce the Release

- [ ] Update GitHub release notes if needed
- [ ] Tweet/post about the release (optional)
- [ ] Update any external documentation
- [ ] Notify users in relevant forums/communities

### 2. Monitor for Issues

- [ ] Watch GitHub issues for bug reports
- [ ] Monitor npm download stats
- [ ] Check for installation problems

### 3. Update Documentation

If the release includes new features:

- [ ] Update README.md examples
- [ ] Update documentation site (if applicable)
- [ ] Update tutorial videos (if applicable)

## npm Quick Reference

### Common Commands

```bash
# Check package info
npm view brewcompetition-cli
npm view brewcompetition-cli version
npm view brewcompetition-cli versions

# Package management
npm owner ls brewcompetition-cli
npm owner add <username> brewcompetition-cli

# Deprecate a version
npm deprecate brewcompetition-cli@1.0.0 "Message here"

# Tags
npm dist-tag ls brewcompetition-cli
npm dist-tag add brewcompetition-cli@1.0.0 latest
```

### Testing Locally

```bash
# Create and test package
npm pack
npm install -g ./brewcompetition-cli-*.tgz
brewcompetition --version
npm uninstall -g brewcompetition-cli
```

## Troubleshooting

### "You do not have permission to publish"

**Solution**: Ensure you're logged in and have access:

```bash
npm whoami
npm owner ls brewcompetition-cli
```

If you're not listed, ask the package owner to add you:

```bash
npm owner add <your-username> brewcompetition-cli
```

### "Version already exists"

**Solution**: You're trying to publish a version that already exists:

```bash
# Check current version
npm view brewcompetition-cli version

# Bump to a new version
npm version patch
npm publish
```

### "Package name too similar to existing package"

**Solution**: The package name might be taken or too similar. Check:

```bash
npm search brewcompetition
```

### "Missing 2FA token" or "Adding a new TOTP 2FA is no longer supported"

**Solution**: npm no longer supports TOTP (time-based one-time password) 2FA for new setups.

**Fix:**
1. Visit https://www.npmjs.com/settings/YOUR_USERNAME/tfa
2. Add a security key:
   - Hardware token (e.g., YubiKey)
   - Platform authenticator (e.g., Touch ID, Windows Hello, Face ID)
3. Run `npm publish` - it will prompt for 2FA via your security key

**Important Notes:**
- The command `npm profile enable-2fa auth-and-writes` no longer works for new setups
- Classic tokens expired November 19, 2024
- Granular tokens are limited to 90 days with 2FA enforced by default
- If you have existing TOTP 2FA, it still works, but new setups require security keys

### Build Fails Before Publishing

**Solution**: Ensure all dependencies are installed and build succeeds:

```bash
rm -rf node_modules dist
npm install
npm run build
npm test
```

### Git Tag Already Exists

**Solution**: Delete the tag and recreate:

```bash
# Delete local tag
git tag -d v1.0.0

# Delete remote tag
git push origin :refs/tags/v1.0.0

# Create new tag
npm version patch
git push origin main --tags
```

## Release Checklist Template

Copy this for each release:

```markdown
## Release vX.Y.Z Checklist

### Pre-Release
- [ ] All tests pass
- [ ] Linting passes
- [ ] Build succeeds
- [ ] CHANGELOG.md updated
- [ ] Version number decided
- [ ] All PRs merged

### Release
- [ ] Version bumped: `npm version X.Y.Z`
- [ ] CHANGELOG.md finalized
- [ ] Changes committed
- [ ] Pushed to GitHub: `git push origin main --tags`
- [ ] GitHub release created

### Publishing
- [ ] Logged into npm: `npm whoami`
- [ ] Published: `npm publish`
- [ ] Verified: `npm view brewcompetition-cli version`
- [ ] Tested installation: `npm install -g brewcompetition-cli@latest`

### Post-Release
- [ ] Release announced
- [ ] Issues monitored
- [ ] Documentation updated
```

## Automated Release (Future)

Consider setting up automated releases with GitHub Actions.

**Important**: Use granular access tokens (not classic tokens):
1. Create a granular token at https://www.npmjs.com/settings/YOUR_USERNAME/tokens
2. Set permissions: Publish packages
3. Set expiration: 90 days or less
4. Add token to GitHub Secrets as `NPM_TOKEN`
5. Rotate token before expiration

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
          registry-url: 'https://registry.npmjs.org'
      - run: npm ci
      - run: npm test
      - run: npm run build
      - run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

**Note**: Granular tokens expire after 90 days. Set a calendar reminder to rotate your token.

## Resources

- [npm Publishing Guide](https://docs.npmjs.com/packages-and-modules/contributing-packages-to-the-registry)
- [Semantic Versioning](https://semver.org/)
- [Keep a Changelog](https://keepachangelog.com/)
- [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github)

## Questions?

If you have questions about the release process:
1. Check this document
2. Review previous releases on GitHub
3. Ask in the project discussions
4. Contact the maintainers
