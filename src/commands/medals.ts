import {Args, Command, Flags} from '@oclif/core'
import axios from 'axios';
import fs from 'node:fs';
import path from 'node:path';

import { parseResults } from '../bcoem.js';

interface Config {
  brewers: string[];
  club: string;
  competitions: string[];
}

export default class Medals extends Command {
  static args = {
    url: Args.string({description: 'homebrew competition url', required: false}),
  }

  static description = 'extract competition winners from a URL'
  
  static examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  static flags = {
    brewers: Flags.string({
      char: 'b',
      default: undefined,
      description: 'Include specific brewers',
    }),
    club: Flags.string({
      char: 'c',
      default: undefined,
      description: 'Filter by club name',
    }),
    file: Flags.string({
      char: 'f',
      default: undefined,
      description: 'Path to the config file',
    }),
    help: Flags.help({ char: 'h' }),
    output: Flags.string({
      char: 'o',
      default: 'json',
      description: 'Output format. Accepted values: json, csv',
      options: ['json', 'csv'],
    }),
  };

  async run() {
    const { args, flags } = await this.parse(Medals);
    const { url } = args;

    if (flags.file && (flags.brewers || flags.club || url)) {
      throw new Error('When specifying an external configuration file do not use explicit flags and/or arguments');
    } else if (!flags.file && !url) {
      throw new Error("url is required when not specifying an external configuration file");
    }

    try {
      let filters = { brewers: flags.brewers, club: flags.club };

      if (flags.file) {
        const configPath = path.resolve(flags.file);
        if (!fs.existsSync(configPath)) {
          throw new Error('Config file not found.');
        }
        
        const configData = fs.readFileSync(configPath, 'utf8');
        const config: Config = JSON.parse(configData);

        const {brewers, club, competitions} = config
        filters = { brewers: brewers.join(','), club };

        if (!config || !competitions || !Array.isArray(competitions)) {
          throw new Error('Invalid config file format.');
        }

        await Promise.all(competitions.map(url => this.fetchMedals(url, flags.output, filters)));
      } else if (url) {
          await this.fetchMedals(url, flags.output, filters);
        } else {
          throw new Error("url is required when not specifying an external configuration file");
        }
    } catch (error) {
        console.error('Error:', error);
    }
  }

  private async fetchMedals(url: string, output: string, filters : { brewers: string | undefined, club: string | undefined }) {
    const response = await axios.get(url);
    const htmlString = response.data;
    const tableSelector = '.bcoem-winner-table';

    const result = await parseResults(htmlString, tableSelector, filters);
    if (result) {
      if (output.toLowerCase() === 'json') {
        const jsonData = csvToJson(result, '|');
        console.log(JSON.stringify(jsonData, null, 2));
      } else if (output.toLowerCase() === 'csv') {
        console.log(result.header);
        console.log(result.data);
      }
    }
  }
}

function removeEmptyLists(obj: Record< string, Record<string, unknown>[]>) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value.length > 0)
  );
}

function csvToJson(result: { data: string; header: string; }, delimiter: string = ',' ) {
  const jsonData: Record<string, Record<string, string>[]> = {};

  for (const row of result.data.split('\n')) {
    const rowData = row.split(delimiter);
    const tableKey = rowData.shift(); // Remove the first element (table name)
    
    // Initialize table data as an array if it doesn't exist
    if (tableKey && !jsonData[tableKey]) {
      jsonData[tableKey] = [];
    }

    const rowObject: Record<string, string> = {};
    for (const [index, value] of rowData.entries()) {
      const columnName = result.header.split(delimiter)[index+1];
      // if (columnName !== "Table / Category") {
      rowObject[columnName] = value;
      // }
    }

    if (tableKey) {
      jsonData[tableKey].push(rowObject);
    }
  }

  // remove any top level attribute that has an empty list
  return removeEmptyLists(jsonData);
}
