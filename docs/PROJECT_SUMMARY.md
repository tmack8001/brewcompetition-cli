# Project Summary

## Overview

Brew Competition CLI is a command-line tool that extracts medal winners and competition metadata from multiple homebrew competition management platforms. It provides a unified interface for accessing competition results regardless of the underlying platform.

## Key Features

### Multi-Platform Support

The tool supports three major competition platforms:

1. **BCOEM (Brew Competition Online Entry Management)**
   - Full support for results and metadata
   - Traditional HTML parsing
   - Most widely used platform

2. **Reggie**
   - Results parsing with dual-mode approach
   - JavaScript data extraction and HTML fallback
   - Growing in popularity

3. **BAP (Beer Awards Platform)**
   - API-first results parsing
   - Modern React-based platform
   - Emerging platform

### Automatic Platform Detection

The tool automatically detects which platform to use based on the competition URL hostname:
- No manual configuration required
- Seamless user experience
- Easy to extend with new platforms

### Flexible Filtering

Users can filter results by:
- Specific brewer names (comma-separated list)
- Club name
- Both brewers and club

### Multiple Output Formats

- **JSON**: Structured data for programmatic processing
- **CSV**: Pipe-delimited format for spreadsheet import

### Batch Processing

Config file support allows processing multiple competitions at once:
- Single command for multiple competitions
- Consistent filters across all competitions
- Parallel processing for speed

### Entry Count Information

All parsers extract and display the total number of entries in each category:
- Helps understand competition level
- Useful for analyzing performance
- Consistent across all platforms

## Architecture Highlights

### Design Patterns

1. **Factory Pattern**: Parser creation based on platform detection
2. **Interface-Based Design**: All parsers implement common interface
3. **Strategy Pattern**: Different parsing strategies per platform

### Extensibility

The architecture makes it easy to:
- Add new competition platforms
- Extend existing parsers
- Add new output formats
- Implement new filtering options

### Code Organization

```
src/
├── commands/          # CLI commands (medals, competitions)
├── parsers/           # Platform-specific parsers
│   ├── types.ts      # Shared interfaces
│   ├── platform-detector.ts
│   ├── parser-factory.ts
│   └── *-parser.ts   # Individual parsers
└── index.ts          # Entry point
```

## Technical Stack

- **Language**: TypeScript
- **CLI Framework**: oclif
- **HTML Parsing**: Cheerio
- **HTTP Client**: Axios
- **Testing**: Mocha + Chai
- **Build Tool**: TypeScript Compiler

## Use Cases

### Individual Brewers

- Track personal medals across competitions
- Monitor performance over time
- Identify successful recipes

### Homebrew Clubs

- Track club member achievements
- Analyze club performance
- Celebrate member successes

### Competition Organizers

- Extract results for publication
- Generate reports
- Analyze competition statistics

### Researchers

- Study competition trends
- Analyze style popularity
- Research brewing patterns

## Project Status

### Current State

- ✅ Core functionality complete
- ✅ Three platforms supported
- ✅ Comprehensive test coverage
- ✅ Full documentation
- ✅ Ready for production use

### Future Enhancements

Potential improvements:
- Metadata parsing for Reggie and BAP
- Additional output formats (Excel, PDF)
- Historical data tracking
- Competition comparison features
- Web interface
- API service

## Development Principles

### Code Quality

- TypeScript for type safety
- Comprehensive test coverage
- Linting and formatting standards
- Code review process

### Documentation

- Extensive user documentation
- Technical implementation guides
- Contributing guidelines
- Code comments

### User Experience

- Simple, intuitive commands
- Clear error messages
- Helpful examples
- Consistent behavior

### Maintainability

- Modular architecture
- Clear separation of concerns
- Extensible design
- Well-documented code

## Community

### Contributing

The project welcomes contributions:
- Bug reports and fixes
- New platform support
- Feature enhancements
- Documentation improvements

See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.

### Support

- GitHub Issues for bug reports
- Pull Requests for contributions
- Documentation for guidance

## License

MIT License - see [LICENSE](../LICENSE) for details.

## Acknowledgments

- Built with oclif framework
- Uses Cheerio for HTML parsing
- Inspired by the homebrew community
- Thanks to all contributors

## Links

- **Repository**: https://github.com/tmack8001/brewcompetition-cli
- **Issues**: https://github.com/tmack8001/brewcompetition-cli/issues
- **Documentation**: [docs/INDEX.md](INDEX.md)
- **Author**: Trevor Mack (@tmack8001)

## Version History

See [CHANGELOG.md](../CHANGELOG.md) for detailed version history.

## Statistics

- **Platforms Supported**: 3 (BCOEM, Reggie, BAP)
- **Commands**: 2 (medals, competitions)
- **Output Formats**: 2 (JSON, CSV)
- **Test Coverage**: Comprehensive
- **Documentation Pages**: 10+

## Success Metrics

The project aims to:
- Make competition results more accessible
- Save time for brewers and clubs
- Enable data-driven brewing insights
- Support the homebrew community

## Conclusion

Brew Competition CLI provides a powerful, flexible tool for accessing homebrew competition results across multiple platforms. Its extensible architecture and comprehensive documentation make it easy to use and contribute to, while its robust feature set serves the needs of individual brewers, clubs, and the broader homebrew community.
