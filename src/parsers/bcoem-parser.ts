import cheerio from 'cheerio';
import moment from 'moment-timezone';

import { CompetitionParser, ParsedMetadata, ParsedResults } from './types.js';

function getFullTimezoneName(abbreviation: string): string {
    const timezoneMap: { [key: string]: string } = {
        'AEST': 'Australia/Sydney',
        'BST': 'Europe/London',
        'CDT': 'America/Chicago',
        'CET': 'Europe/Paris',
        'EDT': 'America/New_York',
        'JST': 'Asia/Tokyo',
        'MDT': 'America/Denver',
        'PDT': 'America/Los_Angeles'
    };

    return timezoneMap[abbreviation] || moment.tz.guess();
}

function extractDateWindow(dateString: string): { endDate: Date | undefined, startDate: Date | undefined } {
    const dateRegex = /(today)|(?:(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday), ([A-Za-z]+) (\d{1,2}), (\d{4}) (\d{1,2}:\d{2} [AP]M), ([A-Za-z]+)\.)/g;
    const dates = [];

    const matches = dateString.matchAll(dateRegex);
    for (const match of matches) {
        if (match[1]) {
            dates.push(moment().toDate());
        } else {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const [_, __, dayOfWeek, month, day, year, time, timeZone] = match;
            const dateStr = `${dayOfWeek}, ${day} ${month} ${year} ${time}`;
            const date = moment.tz(dateStr, 'ddd, DD MMM YYYY HH:mm:ss', getFullTimezoneName(timeZone));
            dates.push(date.toDate());
        }
    }

    if (dates.length > 0) {
        const startDate = dates[0];
        const endDate = dates.length > 1 ? dates[1] : undefined;

        return { endDate, startDate };
    }

    throw new Error(`No date ranges found in ${dateString}`);
}

export class BCOEMParser implements CompetitionParser {
    async parseMetadata(html: string): Promise<ParsedMetadata> {
        const $ = cheerio.load(html)
        const accountRegWindow = $('a[name="reg_window"]').nextAll('p').eq(0).text();
        const volunteerRegWindow = $('a[name="reg_window"]').nextAll('p').eq(1).text();
        const entryRegWindow = $('a[name="entry-registration"]').nextAll('p').eq(0).text();
        const numRequired = $('a[name="entry-acceptance-rules"]').nextAll('p').eq(0).text();
        const dropOffWindow = $('a[name="drop-off-locations"]').nextAll('p').eq(0).text();
        const shippingWindow = $('a[name="shipping-info"]').nextAll('p').eq(0).text();
        const awardsCeremony = $('a[name="awards-ceremony"]').nextAll('p').eq(0).text();

        const header = [
            "entrant_registration",
            "entrant_registration_start_date",
            "entrant_registration_end_date",
            "volunteer_registration",
            "volunteer_registration_start_date",
            "volunteer_registration_end_date",
            "entry_registration",
            "entry_registration_start_date",
            "entry_registration_end_date",
            "num_required",
            "drop_off_window",
            "drop_off_window_start_date",
            "drop_off_window_end_date",
            "shipping_window",
            "shipping_window_start_date",
            "shipping_window_end_date",
            "awards_ceremony",
            "awards_ceremony_start_date",
            "awards_ceremony_end_date",
        ]

        const data = [
            accountRegWindow,
            extractDateWindow(accountRegWindow).startDate,
            extractDateWindow(accountRegWindow).endDate,
            volunteerRegWindow,
            extractDateWindow(volunteerRegWindow).startDate,
            extractDateWindow(volunteerRegWindow).endDate,
            entryRegWindow,
            extractDateWindow(entryRegWindow).startDate,
            extractDateWindow(entryRegWindow).endDate,
            numRequired,
            dropOffWindow,
            extractDateWindow(dropOffWindow).startDate,
            extractDateWindow(dropOffWindow).endDate,
            shippingWindow,
            extractDateWindow(shippingWindow).startDate,
            extractDateWindow(shippingWindow).endDate,
            awardsCeremony,
            extractDateWindow(awardsCeremony).startDate,
            extractDateWindow(awardsCeremony).endDate,
        ]

        const headerCsv = header.join('|');
        const dataCsv = data.join('|');

        return {
            data: dataCsv,
            header: headerCsv,
        };
    }

    async parseResults(html: string, filters: { brewers: string | undefined, club: string | undefined }): Promise<ParsedResults | undefined> {
        const $ = cheerio.load(html)
        const tableSelector = '.bcoem-winner-table';
        const table = $(tableSelector)

        if (!table || table.length === 0) {
            console.error('Table not found');
            return;
        }

        const header: string[] = [];
        const data: string[][] = [];

        $(`${tableSelector}`).each((_index, element) => {
            const tableNameRaw: string = $(element).find(`h3`).text().trim();
            if (tableNameRaw.includes("Brewers") || tableNameRaw.includes("Clubs")) {
                return;
            }

            const { entryCount, tableName } = this.extractCategoryAndEntryCount(tableNameRaw);

            if (header.length === 0) {
                header.push("Table / Category", "Place", "Entry Count");
            }

            if (header.length < 7) {
                $(element).find(`table thead tr th`).each((thIndex, thElement) => {
                    if (thIndex > 0) { // Skip "Place" as we already added it
                        header.push($(thElement).text().trim());
                    }
                });
            }

            $(element).find(`table tbody tr`).each((_rowIndex, row) => {
                const cells = $(row).find('td');
                
                // Extract brewer and club for filtering
                const brewer = this.removeMhpBadge($(cells[1]).text().trim());
                const club = $(cells[4]).text().trim();

                const shouldInclude = this.shouldIncludeEntry(brewer, club, filters);

                if (shouldInclude) {
                    const rowData: string[] = [
                        tableName,
                        // Add place (first cell)
                        this.sanitizeForCsv(this.removeMhpBadge($(cells[0]).text().trim())),
                        // Add entry count
                        entryCount
                    ];

                    // Add remaining cells (brewer, entry name, style, club)
                    for (let i = 1; i < cells.length; i++) {
                        const cellText = $(cells[i]).text().trim();
                        rowData.push(this.sanitizeForCsv(this.removeMhpBadge(cellText)));
                    }

                    data.push(rowData);
                }
            });
        })

        const headerCsv = header.join('|');
        const dataCsv = data.map(row => row.join('|')).join('\n');

        return {
            data: dataCsv,
            header: headerCsv,
        };
    }

    private extractCategoryAndEntryCount(tableNameRaw: string): { entryCount: string, tableName: string } {
        // Extract entry count from table name (format: "Table 1: Category (7 entries)")
        const entryCountMatch = tableNameRaw.match(/\((\d+)\s+entries\)$/);
        const entryCount = entryCountMatch ? entryCountMatch[1].trim() : '';
        const tableName = tableNameRaw.replace(/\s*\(\d+\s+entries\)$/, '').trim();

        return { entryCount, tableName };
    }

    private removeMhpBadge(text: string): string {
        return text.replaceAll(' MHP', '');
    }

    private sanitizeForCsv(text: string): string {
        return text.replaceAll(',', '');
    }

    private shouldIncludeEntry(brewer: string, club: string, filters: { brewers: string | undefined, club: string | undefined }): boolean {
        // If no filters, include everything
        if (!filters.brewers && !filters.club) {
            return true;
        }

        // If brewer filter is set, check if this brewer matches
        if (filters.brewers) {
            const brewerList = filters.brewers.split(',').map(b => b.trim());
            if (brewerList.includes(brewer)) {
                return true;
            }
        }

        // If club filter is set, check if this club matches
        if (filters.club && club === filters.club) {
            return true;
        }

        return false;
    }
}
