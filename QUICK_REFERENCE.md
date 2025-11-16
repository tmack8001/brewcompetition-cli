# Quick Reference Card

Essential commands and information for Brew Competition CLI.

## Installation

```bash
npm install -g brewcompetition-cli
```

## Basic Commands

```bash
# Fetch all medals
brewcompetition medals <url>

# Filter by brewer
brewcompetition medals <url> --brewers "Your Name"

# Filter by club
brewcompetition medals <url> --club "Your Club"

# Export to CSV
brewcompetition medals <url> --output csv > results.csv

# Use config file
brewcompetition medals --file config.json

# Get help
brewcompetition --help
brewcompetition medals --help
```

## Platform URLs

| Platform | URL Pattern | Example |
|----------|-------------|---------|
| BCOEM | Any BCOEM site | `https://example-bcoem.com/results` |
| Reggie | `reggiebeer.com` | `https://reggiebeer.com/ReggieWeb.php?Web=1000882` |
| BAP | `beerawardsplatform.com` | `https://beerawardsplatform.com/competition/results` |

## Config File Format

```json
{
  "brewers": ["Name 1", "Name 2"],
  "club": "Club Name",
  "competitions": [
    "https://competition1.com/results",
    "https://competition2.com/results"
  ]
}
```

## Output Formats

### JSON (default)
```bash
brewcompetition medals <url> --output json
```

### CSV
```bash
brewcompetition medals <url> --output csv
```

## Common Workflows

### Track Personal Medals
```bash
brewcompetition medals <url> --brewers "Your Name" --output csv > my-medals.csv
```

### Track Club Performance
```bash
brewcompetition medals <url> --club "Your Club" --output json > club-results.json
```

### Multiple Competitions
```bash
# Create config.json
cat > config.json << EOF
{
  "brewers": ["Your Name"],
  "competitions": [
    "https://comp1.com/results",
    "https://comp2.com/results"
  ]
}
EOF

# Run
brewcompetition medals --file config.json
```

## Development

```bash
# Clone and setup
git clone https://github.com/tmack8001/brewcompetition-cli.git
cd brewcompetition-cli
npm install

# Build
npm run build

# Test
npm test

# Lint
npm run lint

# Link for local testing
npm link
```

## Publishing (Maintainers)

```bash
# Bump version
npm version patch  # or minor, major

# Publish
npm publish

# Verify
npm view brewcompetition-cli version
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| No results | Try without filters first |
| Wrong platform | Check URL hostname |
| Network error | Verify URL is accessible |
| Build fails | `rm -rf node_modules && npm install` |

## Documentation

| Document | Purpose |
|----------|---------|
| [README.md](README.md) | Project overview |
| [docs/QUICK_START.md](docs/QUICK_START.md) | Getting started |
| [docs/EXAMPLES.md](docs/EXAMPLES.md) | Usage examples |
| [docs/FAQ.md](docs/FAQ.md) | Common questions |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute |

## Links

- **Repository**: https://github.com/tmack8001/brewcompetition-cli
- **Issues**: https://github.com/tmack8001/brewcompetition-cli/issues
- **npm**: https://www.npmjs.com/package/brewcompetition-cli
- **Documentation**: [docs/INDEX.md](docs/INDEX.md)

## Support

- Check [FAQ](docs/FAQ.md)
- Search [Issues](https://github.com/tmack8001/brewcompetition-cli/issues)
- Open new issue

---

**Version**: 0.0.0 (pre-release) | **License**: MIT | **Author**: Trevor Mack (@tmack8001)

**Status**: 98% complete - ready for final testing and release! 🎉
