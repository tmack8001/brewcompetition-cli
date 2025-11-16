# Architecture Overview

## System Flow

```bash
┌─────────────────────────────────────────────────────────────┐
│                         User Input                          │
│  brewcompetition medals <URL> --brewers "Name" --club "X"   │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    Commands Layer                           │
│  • medals.ts - Extract medal winners                        │
│  • competitions.ts - Extract competition metadata           │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                   Parser Factory                            │
│  getParser(url) → Detects platform and returns parser       │
└────────────────────────────┬────────────────────────────────┘
                             │
                ┌────────────┼────────────┐
                ▼            ▼            ▼
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        │  BCOEM   │  │  Reggie  │  │   BAP    │
        │  Parser  │  │  Parser  │  │  Parser  │
        └──────────┘  └──────────┘  └──────────┘
                │            │            │
                └────────────┼────────────┘
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                   Unified Output                            │
│  • CSV format: header|data                                  │
│  • JSON format: { category: [results] }                     │
└─────────────────────────────────────────────────────────────┘
```

## Directory Structure

```bash
src/
├── commands/
│   ├── medals.ts           # CLI command for fetching medals
│   └── competitions.ts     # CLI command for fetching metadata
├── parsers/
│   ├── types.ts           # Shared interfaces and types
│   ├── platform-detector.ts  # URL-based platform detection
│   ├── parser-factory.ts  # Factory for creating parsers
│   ├── bcoem-parser.ts    # BCOEM implementation
│   ├── reggie-parser.ts   # Reggie implementation
│   └── bap-parser.ts      # BAP implementation
├── bcoem.ts               # [DEPRECATED] Old BCOEM code
└── index.ts               # Entry point

test/
├── commands/
│   └── medals.test.ts
└── parsers/
    └── platform-detector.test.ts
```

## Key Interfaces

### CompetitionParser Interface

All parsers implement this interface:

```typescript
interface CompetitionParser {
  parseResults(
    html: string,
    filters: { brewers: string | undefined; club: string | undefined }
  ): Promise<ParsedResults | undefined>;
  
  parseMetadata(html: string): Promise<ParsedMetadata>;
}
```

### Platform Detection

```typescript
function detectPlatform(url: string): Platform {
  const hostname = new URL(url).hostname.toLowerCase();
  
  if (hostname.includes('reggiebeer.com')) return Platform.REGGIE;
  if (hostname.includes('beerawardsplatform.com')) return Platform.BAP;
  return Platform.BCOEM; // default
}
```

### Parser Factory

```typescript
function getParser(url: string): CompetitionParser {
  const platform = detectPlatform(url);
  
  switch (platform) {
    case Platform.BCOEM: return new BCOEMParser();
    case Platform.REGGIE: return new ReggieParser();
    case Platform.BAP: return new BAPParser();
  }
}
```

## Data Flow Example

1. **User runs command**:
   ```bash
   brewcompetition medals https://reggiebeer.com/results --brewers "John"
   ```

2. **Command parses arguments**:
   - URL: `https://reggiebeer.com/results`
   - Filters: `{ brewers: "John", club: undefined }`

3. **Factory detects platform**:
   - Hostname contains `reggiebeer.com` → Platform.REGGIE

4. **Factory returns parser**:
   - `new ReggieParser()`

5. **Parser fetches and parses HTML**:
   - Downloads HTML from URL
   - Extracts results using Reggie-specific selectors
   - Applies filters (brewers, club)

6. **Results formatted and output**:
   - CSV or JSON format
   - Printed to console

## Extension Points

### Adding a New Platform

1. Create `src/parsers/newplatform-parser.ts`:
```typescript
export class NewPlatformParser implements CompetitionParser {
  async parseResults(html: string, filters: any) {
    // Implementation
  }
  
  async parseMetadata(html: string) {
    // Implementation
  }
}
```

2. Update `platform-detector.ts`:
```typescript
if (hostname.includes('newplatform.com')) {
  return Platform.NEWPLATFORM;
}
```

3. Update `parser-factory.ts`:
```typescript
case Platform.NEWPLATFORM:
  return new NewPlatformParser();
```

4. Add to `types.ts`:
```typescript
export enum Platform {
  BCOEM = 'bcoem',
  REGGIE = 'reggie',
  BAP = 'bap',
  NEWPLATFORM = 'newplatform',
}
```

## Design Decisions

### Why Factory Pattern?
- Single entry point for parser creation
- Easy to add new platforms without modifying existing code
- Encapsulates platform detection logic
- Follows Open/Closed Principle (open for extension, closed for modification)

### Why Interface-Based?
- Ensures all parsers have consistent API
- Makes testing easier with mock implementations
- Allows for future parser variations (e.g., API-based vs HTML scraping)
- Enables polymorphism - commands don't need to know which parser they're using

### Why Hostname Detection?
- Simple and reliable - no complex heuristics needed
- Works immediately without fetching page content
- No API calls required for detection
- Works with any URL structure from known platforms
- Easy to extend with new platform patterns

### Why Keep Old bcoem.ts?
- Backward compatibility during transition period
- Can be removed after thorough verification
- Serves as reference implementation for BCOEM parser
- Allows gradual migration without breaking existing functionality

## Performance Considerations

### Caching
The tool uses `node-persist` for caching competition data, reducing redundant network requests.

### Parallel Processing
When using config files with multiple competitions, requests are processed in parallel using `Promise.all()`.

### Memory Efficiency
Results are streamed and processed incrementally rather than loading entire datasets into memory.

## Security Considerations

- All URLs are validated before making requests
- HTML parsing uses Cheerio (safe DOM manipulation)
- No eval() or dynamic code execution
- Input sanitization for brewer names and club filters
- HTTPS preferred for all network requests
