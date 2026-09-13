# Release Process

This document describes how to create and publish releases of Brew Competition CLI.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Pre-Release Checklist](#pre-release-checklist)
- [Version Numbering](#version-numbering)
- [Release Steps](#release-steps)
  - [Cutting a release](#cutting-a-release)
  - [If a release goes wrong](#if-a-release-goes-wrong)
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
node --version  # Should be >= 20.0.0

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

### Runtime Support Policy

**Dropping support for a Node.js version that is already end-of-life is a MINOR
release, not a MAJOR one.**

Raising the `engines.node` floor is technically a breaking change for anyone still
on the removed runtime. We treat it as minor anyway, on the grounds that an
end-of-life Node.js receives no security patches, so nobody should be running the
CLI on one and a major version bump overstates the disruption. `engines` is also
advisory in npm by default — installation warns rather than fails.

What this means in practice:

- Raising the floor to a version that is **already EOL upstream** → MINOR.
- Raising the floor to a version that is **still supported** → MAJOR, because that
  strands users who are on a runtime they were entitled to expect works.

Either way, call it out under `### Changed` in the CHANGELOG with the EOL date, so
someone reading the release notes can see the reasoning rather than inferring it
from the version number.

Applied so far:

| Release | Change | Rationale |
| --- | --- | --- |
| 1.1.0 | Node 18 → 20 | Node 18 reached end of life 2025-04-30 |

### Pre-Release Versions

For testing before official release:

- **Alpha**: `1.0.0-alpha.1` - Early testing
- **Beta**: `1.0.0-beta.1` - Feature complete, testing
- **RC**: `1.0.0-rc.1` - Release candidate

## Release Steps

Releases are cut by dispatching a workflow from the GitHub Actions tab. Nothing
about a release is done from a local checkout any more: the workflow bumps the
version, rolls the changelog, tags, publishes the release page with notes and a
tarball, and optionally publishes to npm.

### Cutting a release

**Actions → Release → Run workflow**, from `main`.

| Input | Meaning |
| --- | --- |
| `bump` | `patch`, `minor` or `major`. See [Version Numbering](#version-numbering) — dropping an already-EOL Node version is minor. |
| `dry_run` | On by default. Computes the version and notes, pushes nothing. Run it once this way and read the job summary. |
| `publish_npm` | Publishes to npm. Requires the `NPM_TOKEN` secret. |
| `retry_tag` | Recovery. Give an existing tag (e.g. `v1.1.0`) to re-run notes, assets and publishing for it without bumping anything. |

The workflow refuses to run when:

- it is not on `main` (unless recovering with `retry_tag`),
- `[Unreleased]` in the changelog has no real entries — only the `-` placeholders,
- the tag it would create already exists.

Those three guards are what stop a half-formed release from going out.

### If a release goes wrong

**Actions → Rollback release → Run workflow.** Each action is independent; pick
what you need. It requires the version typed twice, and defaults to a dry run.

What is possible depends on how long ago it published:

| Action | Window | Effect |
| --- | --- | --- |
| `demote_npm_latest` | any time | Points npm's `latest` back at the previous release. Fastest mitigation, fully reversible, and usually the right first move — new installs immediately stop getting the bad version. |
| `deprecate_npm` | any time | Version stays installable but warns on install. The durable "pull" for anything older than 72 hours. |
| `unpublish_npm` | **72 hours only** | Removes it. **Burns the version number permanently** — npm will never accept it again. Fails outright past the window. |
| `delete_github_release` | any time | Deletes the release page only. |
| `delete_git_tag` | any time | Deletes the tag only. |

npm and GitHub are independent: deleting the release page does nothing to npm, and
unpublishing does nothing to the release page.

To ship the fix afterwards: land it on `main` with a `### Fixed` entry under
`[Unreleased]`, then dispatch **Release** with a `patch` bump. If you unpublished,
that number is gone and the next patch skips it.

### Why not trigger on pushing a tag

The previous workflow ran on `push: tags`. A tag trigger cannot bump a version or
roll a changelog, so half the release happened locally and half in CI — and when
either half failed the repository was left inconsistent. It also failed outright on
`v1.1.0`: it interpolated the changelog into a shell command with `${{ ... }}`, so
backticks in the release notes ran as command substitutions. Notes are now written
to a file and passed with `--notes-file`, and nothing but repository metadata is
ever interpolated into a `run:` block.

### Local scripts

`scripts/release.sh` and `npm run changelog` still exist for local use, but the
workflow is the supported path — it is the one that enforces the guards above.


### Local Release (legacy)

Superseded by the **Release** workflow above, which enforces guards these steps do
not. Kept for the case where Actions is unavailable. If you use it, you are
responsible for the checks the workflow would have made: on `main`, `[Unreleased]`
non-empty, tag unused.

#### Step 1: Prepare CHANGELOG

First, prepare the CHANGELOG.md for the new version:

```bash
# Interactive - prompts for version type
npm run changelog

# Or specify version directly
npm run changelog 1.0.2
```

This will:
- Calculate the next version number
- Add a new version section to CHANGELOG.md with today's date
- Open CHANGELOG.md for editing

Fill in the changes under the appropriate sections (Added/Changed/Fixed).

#### Step 2: Release

Once CHANGELOG.md is updated, run the release script:

```bash
# For a patch release (bug fixes)
npm run release patch

# For a minor release (new features)
npm run release minor

# For a major release (breaking changes)
npm run release major

# Release and publish to npm in one step
npm run release patch --publish
```

This script will:
- Check for uncommitted changes
- Verify CHANGELOG.md has an entry for the new version
- Run tests
- Build the project
- Bump the version with a descriptive commit message
- Prompt you to push to GitHub
- Optionally publish to npm (with `--publish` flag)

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
          node-version: 20
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
