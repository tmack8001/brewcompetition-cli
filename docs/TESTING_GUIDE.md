# Testing Guide for Multi-Platform Support

## Quick Test Commands

### Test Platform Detection

```bash
# This will show which parser is being used
npm run build

# Test BCOEM (default)
brewcompetition medals https://beerforboobs.sodz.org/ --output csv

# Test Reggie
brewcompetition medals https://reggiebeer.com/ReggieWeb.php?Web=1000882 --output csv

# Test BAP
brewcompetition medals https://beerawardsplatform.com/2025-ash-copper-state-cup/results --output csv
```

## Debugging Parser Issues

If a parser isn't working correctly:

1. **Fetch the HTML manually** to inspect structure:
```bash
curl -o test.html "https://reggiebeer.com/ReggieWeb.php?Web=1000882"
```

2. **Inspect the DOM structure** in the HTML file to identify correct selectors

3. **Update the parser** with correct selectors in:
   - `src/parsers/reggie-parser.ts` for Reggie
   - `src/parsers/bap-parser.ts` for BAP

4. **Common things to check**:
   - Table class names or IDs
   - Header structure (h2, h3, h4, caption)
   - Cell order (place, brewer, entry name, style, club)
   - Text formatting (extra spaces, special characters)

## Refining Parsers

### For Reggie

Look for patterns like:
```html
<table class="results-table">
  <thead>
    <tr>
      <th>Place</th>
      <th>Brewer</th>
      <th>Entry</th>
      <th>Style</th>
      <th>Club</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>1st</td>
      <td>John Doe</td>
      <td>My IPA</td>
      <td>21A - American IPA</td>
      <td>Homebrew Club</td>
    </tr>
  </tbody>
</table>
```

Update selectors in `src/parsers/reggie-parser.ts` accordingly.

### For BAP

Look for patterns like:
```html
<div class="award-table">
  <h3>Category 01: Light Lager</h3>
  <table>
    <tbody>
      <tr>
        <td>Gold</td>
        <td>Jane Smith</td>
        <td>Crisp Lager</td>
        <td>1A - American Light Lager</td>
        <td>Beer Club</td>
      </tr>
    </tbody>
  </table>
</div>
```

Update selectors in `src/parsers/bap-parser.ts` accordingly.

## Testing with Config Files

Create a test config file `test-config.json`:

```json
{
  "brewers": ["Your Name", "Friend Name"],
  "club": "Your Homebrew Club",
  "competitions": [
    "https://beerforboobs.sodz.org/",
    "https://reggiebeer.com/ReggieWeb.php?Web=1000882",
    "https://beerawardsplatform.com/2025-ash-copper-state-cup/results"
  ]
}
```

Then run:
```bash
brewcompetition medals --file test-config.json --output json
```

## Expected Output Format

Both CSV and JSON outputs should have this structure:

### CSV Format
```
Table / Category|Place|Brewer|Entry Name|Style|Club
01: Light Lager|1st|John Doe|My Lager|1A American Light Lager|Homebrew Club
```

### JSON Format
```json
{
  "01: Light Lager": [
    {
      "Place": "1st",
      "Brewer": "John Doe",
      "Entry Name": "My Lager",
      "Style": "1A American Light Lager",
      "Club": "Homebrew Club"
    }
  ]
}
```

## Unit Testing

Run the test suite:

```bash
npm test
```

Run specific test files:

```bash
npm test -- test/parsers/platform-detector.test.ts
```

Run tests with coverage:

```bash
npm test -- --coverage
```

## Integration Testing

Test with real competition URLs:

```bash
# Test each platform
brewcompetition medals https://example-bcoem.com/results --output json
brewcompetition medals https://reggiebeer.com/ReggieWeb.php?Web=1000882 --output json
brewcompetition medals https://beerawardsplatform.com/competition/results --output json
```

## Troubleshooting

### "Table not found" error
- The parser couldn't find results tables in the HTML
- Check the HTML structure and update selectors in the parser
- Verify the URL is correct and results are published

### Empty results
- Filters might be too restrictive
- Try without `--brewers` or `--club` flags first
- Check if the competition has published results
- Verify brewer/club names match exactly (case-insensitive)

### Wrong platform detected
- Verify the URL hostname matches expected patterns
- Check `src/parsers/platform-detector.ts` logic
- BCOEM is the default for unknown hostnames

### Build errors
- Run `npm run build` to see TypeScript errors
- Check imports use `.js` extension (required for ES modules)
- Verify all dependencies are installed: `npm install`

### Network errors
- Check internet connectivity
- Verify the competition URL is accessible
- Some competitions may have rate limiting

### Parsing errors
- HTML structure may differ from expected
- Save the HTML locally and inspect: `curl <url> > test.html`
- Check for JavaScript-rendered content (may need different approach)
- Open an issue with the URL for investigation

## Performance Testing

Test with large competitions:

```bash
# Time the execution
time brewcompetition medals <url> --output json

# Test with multiple competitions
time brewcompetition medals --file config.json
```

## Debugging Tips

### Enable verbose logging

Add console.log statements in parsers:

```typescript
console.log('Found tables:', tables.length);
console.log('Category:', categoryName);
```

### Inspect parsed data

Use the example scripts:

```bash
npm run build
node examples/test-reggie-output.js
node examples/test-json-output.js
```

### Test with saved HTML

Save HTML locally to avoid repeated network requests:

```bash
curl "https://reggiebeer.com/ReggieWeb.php?Web=1000882" > test.html
```

Then modify the parser to read from file during development.
