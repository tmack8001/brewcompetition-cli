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
- Easy to add new platforms
- Encapsulates platform detection logic

### Why Interface-Based?
- Ensures all parsers have consistent API
- Makes testing easier
- Allows for future parser variations

### Why Hostname Detection?
- Simple and reliable
- No need for API calls or complex heuristics
- Works with any URL structure from known platforms

### Why Keep Old bcoem.ts?
- Backward compatibility during transition
- Can be removed after verification
- Serves as reference for BCOEM implementation
