import {Args, Command, Flags} from '@oclif/core'
import axios from 'axios';
import fs from 'node:fs';
import path from 'node:path';

import { parseMetadata } from '../bcoem.js';

interface Config {
  competitions: string[];
}

export default class Competitions extends Command {
  static args = {
    url: Args.string({description: 'homebrew competition url', required: false}),
  }

  static description = 'extract competition metadata from a URL'
  
  static examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  static flags = {
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
    const { args, flags } = await this.parse(Competitions);
    const { url } = args;

    if (flags.file && url) {
      throw new Error('When specifying an external configuration file do not use explicit flags and/or arguments');
    } else if (!flags.file && !url) {
      throw new Error("url is required when not specifying an external configuration file");
    }

    try {
      if (flags.file) {
        const configPath = path.resolve(flags.file);
        if (!fs.existsSync(configPath)) {
          throw new Error('Config file not found.');
        }
        
        const configData = fs.readFileSync(configPath, 'utf8');
        const config: Config = JSON.parse(configData);

        const {competitions} = config

        if (!config || !competitions || !Array.isArray(competitions)) {
          throw new Error('Invalid config file format.');
        }

        await Promise.all(competitions.map(url => this.fetchCompetitionMetadata(url, flags.output)));
      } else if (url) {
          await this.fetchCompetitionMetadata(url, flags.output);
        } else {
          throw new Error("url is required when not specifying an external configuration file");
        }
    } catch (error) {
        console.error('Error:', error);
    }
  }

  private async fetchCompetitionMetadata(url: string, output: string) {
    const response = await axios.get(url);
    const htmlString = response.data;
    const result = await parseMetadata(htmlString);
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

function csvToJson(result: { data: string; header: string; }, delimiter: string = ',' ) {
  const jsonData: Record<string, Record<string, string>> = {};

  for (const row of result.data.split('\n')) {
    const rowData = row.split(delimiter);
    
    const rowObject: Record<string, string> = {};
    for (const [index, value] of rowData.entries()) {
      const columnName = result.header.split(delimiter)[index];
      // if (columnName !== "Table / Category") {
      rowObject[columnName] = value;
      // }
    }

    jsonData.data = rowObject;
  }

  // remove any top level attribute that has an empty list
  return jsonData;
}
