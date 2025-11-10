# Quick Start Guide

## What Changed?

Your CLI now supports **three platforms** instead of just BCOEM:
- ✅ BCOEM (existing - fully working)
- 🆕 Reggie (new - ready for testing)
- 🆕 BAP (new - ready for testing)

The CLI automatically detects which platform to use based on the URL.

## Try It Now

### 1. Build the project
```bash
npm run build
```

### 2. Test with your existing BCOEM URLs
```bash
# This should work exactly as before
brewcompetition medals <your-bcoem-url> --brewers "Your Name"
```

### 3. Test with Reggie
```bash
brewcompetition medals https://reggiebeer.com/ReggieWeb.php?Web=1000882 --output csv
```

### 4. Test with BAP
```bash
brewcompetition medals https://beerawardsplatform.com/2025-ash-copper-state-cup/results --output csv
```

## What to Expect

### BCOEM URLs
Should work perfectly - no changes to existing functionality.

### Reggie & BAP URLs
May need selector adjustments based on actual HTML structure. If you get:
- "Table not found" error → Selectors need updating
- Empty results → Try without filters first
- Parsing errors → HTML structure differs from expected

## Refining Parsers

If Reggie or BAP don't work perfectly:

1. **Save the HTML**:
```bash
curl "https://reggiebeer.com/ReggieWeb.php?Web=1000882" > reggie.html
```

2. **Inspect the structure** - look for:
   - Table class names
   - Header tags (h2, h3, h4)
   - Cell order (place, brewer, entry, style, club)

3. **Update the parser**:
   - Edit `src/parsers/reggie-parser.ts` or `src/parsers/bap-parser.ts`
   - Adjust the selectors to match actual HTML
   - Rebuild: `npm run build`

4. **Test again**:
```bash
brewcompetition medals <url> --output csv
```

## Common Selector Patterns

### If tables have a specific class:
```typescript
$('.results-table').each(...)
```

### If category names are in headers:
```typescript
const tableName = $(element).prev('h3').text()
```

### If cells are in different order:
```typescript
const place = $(cells[0]).text();    // adjust index
const brewer = $(cells[1]).text();   // adjust index
// etc.
```

## Need Help?

Check these docs:
- `TESTING_GUIDE.md` - Detailed debugging steps
- `EXAMPLES.md` - Usage examples
- `ARCHITECTURE.md` - How it all works
- `PLATFORM_SUPPORT.md` - Platform details

## That's It!

The hard work is done. Now just test with real URLs and refine the parsers as needed. The architecture is solid and extensible.
