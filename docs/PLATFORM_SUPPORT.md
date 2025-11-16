# Platform Support

This CLI tool supports multiple homebrew competition management platforms. The platform is automatically detected based on the URL hostname.

## Supported Platforms

### BCOEM (Brew Competition Online Entry Management)
- **Detection**: Default platform when hostname doesn't match other known platforms
- **Example URL**: Any BCOEM-hosted competition
- **Status**: ✅ Fully implemented
- **Features**:
  - Medal results parsing
  - Competition metadata (registration windows, drop-off dates, awards ceremony)

### Reggie
- **Detection**: URLs containing `reggiebeer.com`
- **Example URL**: https://reggiebeer.com/ReggieWeb.php?Web=1000882
- **Status**: ✅ Results parsing fully implemented, metadata parsing pending
- **Features**:
  - Medal results parsing (JavaScript data extraction)
  - Handles both live URLs and saved HTML
  - Competition metadata (to be implemented)

### BAP (Beer Awards Platform)
- **Detection**: URLs containing `beerawardsplatform.com`
- **Example URL**: https://beerawardsplatform.com/2025-ash-copper-state-cup/results
- **Status**: ✅ Results parsing fully implemented via API, metadata parsing pending
- **Features**:
  - Medal results parsing (API-based)
  - Handles both live URLs and saved HTML
  - Competition metadata (to be implemented)

## Usage

The CLI interface remains the same regardless of platform:

```bash
# Fetch medals from any supported platform
brewcompetition medals <url> --brewers "John Doe,Jane Smith" --club "My Homebrew Club"

# Fetch competition metadata
brewcompetition competitions <url>

# Use config file for multiple competitions
brewcompetition medals --file config.json
```

## Architecture

The tool uses a parser factory pattern:

1. **Platform Detection** (`platform-detector.ts`): Analyzes the URL hostname to determine the platform
2. **Parser Factory** (`parser-factory.ts`): Returns the appropriate parser based on detected platform
3. **Platform Parsers**: Each platform has its own parser implementing the `CompetitionParser` interface
   - `bcoem-parser.ts`
   - `reggie-parser.ts`
   - `bap-parser.ts`

## Adding New Platforms

To add support for a new platform:

1. Create a new parser class in `src/parsers/` implementing `CompetitionParser`
2. Add platform detection logic in `platform-detector.ts`
3. Register the parser in `parser-factory.ts`
4. Update this documentation

## Platform-Specific Details

### BCOEM
- **Parsing Method**: HTML scraping with Cheerio
- **Data Source**: Competition results pages
- **Metadata Support**: Full support for registration dates, entry deadlines, drop-off windows, awards ceremony
- **Known Limitations**: None - fully tested and stable

### Reggie
- **Parsing Method**: JavaScript data extraction from embedded scripts
- **Data Source**: Competition results pages with embedded JSON data
- **Metadata Support**: Planned for future release
- **Known Limitations**: Metadata parsing not yet implemented

### BAP (Beer Awards Platform)
- **Parsing Method**: API-based data fetching
- **Data Source**: Platform API endpoints
- **Metadata Support**: Planned for future release
- **Known Limitations**: Metadata parsing not yet implemented

## Testing Status

| Platform | Unit Tests | Integration Tests | Production Ready |
|----------|-----------|-------------------|------------------|
| BCOEM    | ✅        | ✅                | ✅               |
| Reggie   | ✅        | ⚠️ Limited        | ✅               |
| BAP      | ✅        | ⚠️ Limited        | ✅               |

## Future Enhancements

- Metadata parsing for Reggie and BAP platforms
- Support for additional competition platforms
- Enhanced filtering options (by style, by score range)
- Export to additional formats (Excel, PDF)
- Historical data tracking and comparison

## Notes

- Reggie and BAP parsers have been tested with real competition data
- HTML structure variations may require parser adjustments
- Test with actual competition URLs to verify parsing accuracy
- Report issues with specific URLs for investigation
