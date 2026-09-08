import cheerio from 'cheerio';
import moment from 'moment-timezone';

import { BcoemField, extractGlanceWindows, extractSections, findBottleRequirement, findGlanceWindow, sectionParagraph } from './bcoem-sections.js';
import { CompetitionParser, ParsedMetadata, ParsedResults } from './types.js';

function getFullTimezoneName(abbreviation: string): string {
    // Standard-time abbreviations matter as much as daylight ones: a competition
    // whose entry window opens in October and closes in November is quoted in
    // CDT and CST respectively. The IANA zone handles the offset either way.
    const timezoneMap: { [key: string]: string } = {
        'AEST': 'Australia/Sydney',
        'AKDT': 'America/Anchorage',
        'AKST': 'America/Anchorage',
        'BST': 'Europe/London',
        'CDT': 'America/Chicago',
        'CET': 'Europe/Paris',
        'CST': 'America/Chicago',
        'EDT': 'America/New_York',
        'EST': 'America/New_York',
        'GMT': 'Etc/GMT',
        'HST': 'Pacific/Honolulu',
        'JST': 'Asia/Tokyo',
        'MDT': 'America/Denver',
        'MST': 'America/Denver',
        'PDT': 'America/Los_Angeles',
        'PST': 'America/Los_Angeles',
        'UTC': 'Etc/UTC'
    };

    return timezoneMap[abbreviation] || moment.tz.guess();
}

/**
 * Pulls the start and end of a window out of a BCOEM sentence.
 *
 * BCOEM renders a window as two timestamps joined by an em dash and terminated
 * with a full stop - "... accepted at our drop-off locations Friday, August 14,
 * 2026 12:00 AM, EDT - Friday, September 18, 2026 5:00 PM, EDT." The trailing
 * stop is therefore on the closing date only, which is why it is optional here;
 * requiring it matched the end of a window but never its start.
 *
 * @param dateString the sentence to read
 * @returns the window, with either field left `undefined` when it is not stated
 */
function extractDateWindow(dateString: string): { endDate: Date | undefined, startDate: Date | undefined } {
    const dateRegex = /(today)|(?:(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday), ([A-Za-z]+) (\d{1,2}), (\d{4}) (\d{1,2}:\d{2} [AP]M), ([A-Za-z]+))/g;
    const dates = [];

    const matches = dateString.matchAll(dateRegex);
    for (const match of matches) {
        if (match[1]) {
            dates.push(moment().toDate());
        } else {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const [_, __, dayOfWeek, month, day, year, time, timeZone] = match;
            const dateStr = `${dayOfWeek}, ${day} ${month} ${year} ${time}`;
            // The parts are full names and a 12-hour clock, so the format has to
            // say so. Parsing "12:00 AM" with HH:mm:ss silently yields midday.
            const date = moment.tz(dateStr, 'dddd, DD MMMM YYYY hh:mm A', getFullTimezoneName(timeZone));
            if (date.isValid()) dates.push(date.toDate());
        }
    }

    // A section with no dates is normal, not exceptional: a closed competition
    // renders "Registration is closed." and nothing more. Throwing here aborted
    // the whole page for one absent window.
    return { endDate: dates[1], startDate: dates[0] };
}

export class BCOEMParser implements CompetitionParser {
    /**
     * BCOEM serves competition metadata from `index.php?section=entry`. The URL a
     * user has to hand is usually the bare site root or `index.php`, which on a
     * finished competition shows the winners instead, so try the entry-info page
     * as well.
     *
     * @param url the URL the user supplied
     * @returns the supplied URL, then its entry-info variant
     */
    metadataUrls(url: string): string[] {
        const parsed = new URL(url);
        if (parsed.searchParams.get('section')) return [url];

        const entryInfo = new URL(url);
        entryInfo.searchParams.set('section', 'entry');

        return [url, entryInfo.toString()];
    }

    async parseMetadata(html: string): Promise<ParsedMetadata> {
        const sections = extractSections(html);
        const glance = extractGlanceWindows(html);

        // Three strategies, most reliable first. The "At a Glance" cards on newer
        // builds state each window as an explicit timestamp pair. Failing that,
        // the window is read out of the prose under its <h2>. Failing that, the
        // original anchor lookup, which still serves the self-hosted installs
        // running older BCOEM releases.
        const windowFor = (field: BcoemField, text: string) => {
            const card = findGlanceWindow(glance, field);
            if (card) return [card.summary || text, card.open ?? '', card.close ?? ''];

            const { endDate, startDate } = extractDateWindow(text);
            return [text, startDate ?? '', endDate ?? ''];
        };

        const accountRegWindow = sectionParagraph(sections, 'accountRegistration');
        // Older builds have no volunteer heading - judge and steward registration
        // is the second paragraph of the Account Registration section. Newer ones
        // give it a heading of its own, so prefer that and fall back.
        const volunteerRegWindow = sectionParagraph(sections, 'volunteerRegistration')
            || sectionParagraph(sections, 'accountRegistration', 1);
        const entryRegWindow = sectionParagraph(sections, 'entryRegistration');
        const numRequired = findBottleRequirement(sections);
        const dropOffWindow = sectionParagraph(sections, 'dropOff');
        const shippingWindow = sectionParagraph(sections, 'shipping');
        const awardsCeremony = sectionParagraph(sections, 'awardsCeremony');

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
            ...windowFor('accountRegistration', accountRegWindow),
            ...windowFor('volunteerRegistration', volunteerRegWindow),
            ...windowFor('entryRegistration', entryRegWindow),
            numRequired,
            ...windowFor('dropOff', dropOffWindow),
            ...windowFor('shipping', shippingWindow),
            ...windowFor('awardsCeremony', awardsCeremony),
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
