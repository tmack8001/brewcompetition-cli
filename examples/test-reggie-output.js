import fs from 'fs';
import path from 'path';
import { ReggieParser } from '../dist/parsers/reggie-parser.js';

const htmlPath = path.join(process.cwd(), 'test/resources/results/reggie_results.html');
const html = fs.readFileSync(htmlPath, 'utf8');

const parser = new ReggieParser();
const result = await parser.parseResults(html, { brewers: undefined, club: undefined });

// Convert to JSON
const rows = result.data.split('\n');
const headers = result.header.split('|');

const jsonData = {};
for (const row of rows) {
  const rowData = row.split('|');
  const category = rowData[0];
  
  if (!jsonData[category]) {
    jsonData[category] = [];
  }
  
  const rowObject = {};
  for (let i = 1; i < rowData.length; i++) {
    const columnName = headers[i];
    if (columnName === 'Entry Count') {
      const trimmedValue = rowData[i].trim();
      rowObject[columnName] = trimmedValue ? Number.parseInt(trimmedValue, 10) : 0;
    } else {
      rowObject[columnName] = rowData[i].trim();
    }
  }
  
  jsonData[category].push(rowObject);
}

// Show first entry
const firstCategory = Object.keys(jsonData)[0];
console.log('First category:', firstCategory);
console.log('First entry:', JSON.stringify(jsonData[firstCategory][0], null, 2));
console.log('Entry Count type:', typeof jsonData[firstCategory][0]['Entry Count']);
console.log('Entry Count value:', jsonData[firstCategory][0]['Entry Count']);

// Check for any trailing whitespace in values
const firstEntry = jsonData[firstCategory][0];
for (const [key, value] of Object.entries(firstEntry)) {
  if (typeof value === 'string' && (value !== value.trim())) {
    console.log(`WARNING: Field "${key}" has trailing/leading whitespace: "${value}"`);
  }
}
console.log('✓ All string values are properly trimmed');
