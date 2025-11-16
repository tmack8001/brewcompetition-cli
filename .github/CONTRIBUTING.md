# Contributing to Brew Competition CLI

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing to the project.

## Code of Conduct

Be respectful, inclusive, and constructive in all interactions. We're all here to make homebrew competitions more accessible.

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- npm or yarn
- Git

### Setup Development Environment

1. Fork the repository on GitHub
2. Clone your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/brewcompetition-cli.git
   cd brewcompetition-cli
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Build the project:
   ```bash
   npm run build
   ```

5. Run tests:
   ```bash
   npm test
   ```

6. Link for local testing:
   ```bash
   npm link
   ```

## Development Workflow

### Making Changes

1. Create a new branch for your feature or fix:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes following the coding standards below

3. Add or update tests as needed

4. Run the test suite:
   ```bash
   npm test
   ```

5. Run the linter:
   ```bash
   npm run lint
   ```

6. Build the project:
   ```bash
   npm run build
   ```

7. Test your changes manually:
   ```bash
   brewcompetition medals <test-url> --output json
   ```

### Commit Messages

Use clear, descriptive commit messages:

- **feat**: New feature (e.g., `feat: add support for XYZ platform`)
- **fix**: Bug fix (e.g., `fix: handle empty club names`)
- **docs**: Documentation changes (e.g., `docs: update BCOEM implementation guide`)
- **test**: Test additions or changes (e.g., `test: add tests for Reggie parser`)
- **refactor**: Code refactoring (e.g., `refactor: simplify parser factory`)
- **chore**: Maintenance tasks (e.g., `chore: update dependencies`)

Example:
```bash
git commit -m "feat: add entry count extraction for BAP parser"
```

### Pull Requests

1. Push your branch to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

2. Open a Pull Request on GitHub

3. Provide a clear description of:
   - What changes you made
   - Why you made them
   - How to test them
   - Any related issues

4. Wait for review and address any feedback

## Coding Standards

### TypeScript

- Use TypeScript for all new code
- Enable strict type checking
- Avoid `any` types when possible
- Use interfaces for data structures
- Document complex logic with comments

### Code Style

- Follow the existing code style
- Use 2 spaces for indentation
- Use single quotes for strings
- Add trailing commas in multi-line objects/arrays
- Run `npm run lint` before committing

### File Organization

```
src/
├── commands/          # CLI command implementations
├── parsers/           # Platform-specific parsers
│   ├── types.ts      # Shared interfaces
│   ├── platform-detector.ts
│   ├── parser-factory.ts
│   └── *-parser.ts   # Individual parsers
└── index.ts          # Entry point

test/
├── commands/         # Command tests
├── parsers/          # Parser tests
└── resources/        # Test fixtures
```

### Testing

- Write tests for all new features
- Maintain or improve code coverage
- Use descriptive test names
- Include both unit and integration tests
- Add test fixtures for new platforms

Example test structure:
```typescript
describe('NewPlatformParser', () => {
  it('should parse results correctly', async () => {
    // Arrange
    const html = fs.readFileSync('test/resources/results/new_platform.html', 'utf8');
    const parser = new NewPlatformParser();
    
    // Act
    const result = await parser.parseResults(html, { brewers: undefined, club: undefined });
    
    // Assert
    expect(result).toBeDefined();
    expect(result.data).toContain('1st');
  });
});
```

## Adding a New Platform

Follow these steps to add support for a new competition platform:

### 1. Create the Parser

Create `src/parsers/newplatform-parser.ts`:

```typescript
import * as cheerio from 'cheerio';
import { CompetitionParser, ParsedResults, ParsedMetadata } from './types.js';

export class NewPlatformParser implements CompetitionParser {
  async parseResults(
    html: string,
    filters: { brewers: string | undefined; club: string | undefined },
    url?: string
  ): Promise<ParsedResults | undefined> {
    const $ = cheerio.load(html);
    const data: string[] = [];
    const header = 'Table / Category|Place|Entry Count|Brewer|Entry Name|Style|Club';
    
    // Your parsing logic here
    
    return { header, data: data.join('\n') };
  }
  
  async parseMetadata(html: string): Promise<ParsedMetadata> {
    // Metadata parsing (optional for initial implementation)
    throw new Error('Metadata parsing not yet implemented');
  }
}
```

### 2. Update Platform Detection

Edit `src/parsers/platform-detector.ts`:

```typescript
export enum Platform {
  BCOEM = 'bcoem',
  REGGIE = 'reggie',
  BAP = 'bap',
  NEWPLATFORM = 'newplatform', // Add your platform
}

export function detectPlatform(url: string): Platform {
  const hostname = new URL(url).hostname.toLowerCase();
  
  if (hostname.includes('reggiebeer.com')) return Platform.REGGIE;
  if (hostname.includes('beerawardsplatform.com')) return Platform.BAP;
  if (hostname.includes('newplatform.com')) return Platform.NEWPLATFORM; // Add detection
  
  return Platform.BCOEM; // default
}
```

### 3. Register in Parser Factory

Edit `src/parsers/parser-factory.ts`:

```typescript
import { NewPlatformParser } from './newplatform-parser.js';

export function getParser(url: string): CompetitionParser {
  const platform = detectPlatform(url);
  
  switch (platform) {
    case Platform.BCOEM:
      return new BCOEMParser();
    case Platform.REGGIE:
      return new ReggieParser();
    case Platform.BAP:
      return new BAPParser();
    case Platform.NEWPLATFORM:
      return new NewPlatformParser(); // Add case
    default:
      return new BCOEMParser();
  }
}
```

### 4. Add Tests

Create `test/parsers/newplatform-parser.test.ts`:

```typescript
import { expect } from 'chai';
import fs from 'node:fs';
import path from 'node:path';
import { NewPlatformParser } from '../../src/parsers/newplatform-parser.js';

describe('NewPlatformParser', () => {
  it('should parse results', async () => {
    const html = fs.readFileSync(
      path.join(process.cwd(), 'test/resources/results/newplatform_results.html'),
      'utf8'
    );
    
    const parser = new NewPlatformParser();
    const result = await parser.parseResults(html, { brewers: undefined, club: undefined });
    
    expect(result).toBeDefined();
    expect(result?.data).toContain('1st');
  });
});
```

### 5. Add Test Fixtures

Save sample HTML in `test/resources/results/newplatform_results.html`

### 6. Update Documentation

- Add platform details to `docs/PLATFORM_SUPPORT.md`
- Create `docs/NEWPLATFORM_IMPLEMENTATION.md` with implementation details
- Update `README.md` supported platforms table
- Add examples to `docs/EXAMPLES.md`

### 7. Test Thoroughly

```bash
# Run tests
npm test

# Test with real URL
brewcompetition medals https://newplatform.com/competition/results --output json

# Test with filters
brewcompetition medals https://newplatform.com/competition/results \
  --brewers "Test Brewer" \
  --club "Test Club" \
  --output csv
```

## Documentation

### Writing Documentation

- Use clear, concise language
- Include code examples
- Add screenshots where helpful
- Keep documentation up to date with code changes
- Follow the existing documentation structure

### Documentation Structure

- `README.md` - Project overview and quick start
- `docs/INDEX.md` - Documentation index
- `docs/QUICK_START.md` - Getting started guide
- `docs/EXAMPLES.md` - Usage examples
- `docs/ARCHITECTURE.md` - System design
- `docs/PLATFORM_SUPPORT.md` - Platform details
- `docs/TESTING_GUIDE.md` - Testing instructions
- `docs/*_IMPLEMENTATION.md` - Platform-specific details

## Reporting Issues

### Bug Reports

Include:
- Clear description of the issue
- Steps to reproduce
- Expected vs actual behavior
- Competition URL (if applicable)
- Error messages or logs
- Your environment (OS, Node version)

### Feature Requests

Include:
- Clear description of the feature
- Use case and motivation
- Example usage
- Any relevant competition platforms

## Questions?

- Check the [documentation](docs/INDEX.md)
- Search [existing issues](https://github.com/tmack8001/brewcompetition-cli/issues)
- Open a new issue for discussion

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

## Thank You!

Your contributions help make homebrew competitions more accessible to everyone. Cheers! 🍺
