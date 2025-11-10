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

## Troubleshooting

### "Table not found" error
- The parser couldn't find results tables
- Check the HTML structure and update selectors

### Empty results
- Filters might be too restrictive
- Try without `--brewers` or `--club` flags first

### Wrong platform detected
- Verify the URL hostname
- Check `src/parsers/platform-detector.ts` logic

### Build errors
- Run `npm run build` to see TypeScript errors
- Check imports use `.js` extension (required for ES modules)
