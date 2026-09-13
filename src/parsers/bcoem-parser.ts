import cheerio from 'cheerio';

import { detectShortDateOrder, extractMoment, extractWindow, parseTimestamps } from './bcoem-dates.js';
import { BcoemField, extractGlanceWindows, extractSections, findBottleRequirement, findGlanceWindow, sectionParagraph, sectionWindowText } from './bcoem-sections.js';
import { CompetitionParser, ParsedMetadata, ParsedResults } from './types.js';

/**
 * Renders one metadata value for the pipe-delimited row.
 *
 * Two things have to be true of every field. A `|` anywhere in the text would
 * shift every later column and desynchronise the row from its header - the
 * competition prose these fields come from is admin free-text, stored and echoed
 * verbatim, so nothing upstream prevents one. And a date has to be stable
 * wherever the CLI runs, which `Date.prototype.toString()` is not: it renders in
 * the host machine's zone and its own locale-ish format.
 *
 * @param value the field value
 * @returns a single-column string, ISO-8601 for dates
 */
function formatField(value: Date | string | undefined): string {
    if (value === undefined) return '';
    if (value instanceof Date) return value.toISOString();

    return value.replaceAll('|', '/');
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
        // `short` dates are ambiguous between m/d/Y and d/m/Y for any day of 12 or
        // less, so the ordering is inferred once from the whole page.
        const order = detectShortDateOrder(html);

        // Three strategies. The "At a Glance" cards on newer builds give the dates
        // as explicit timestamps, so they win for the date columns outright. For
        // the readable column the section prose wins only when it actually
        // describes the window - it says things the timestamps do not, such as
        // "accepted at our drop-off locations" - because on that build a section's
        // first paragraph is often unrelated rules text, and the card summary is
        // the better answer then. Failing the cards, the prose is parsed; failing
        // a heading match, the original anchor lookup still serves older installs.
        const windowFor = (field: BcoemField, text: string) => {
            const card = findGlanceWindow(glance, field);

            if (card) {
                const describesWindow = text !== '' && parseTimestamps(text, order).length > 0;
                return [describesWindow ? text : card.summary, card.open, card.close];
            }

            // The awards ceremony is a moment, and its paragraph carries the venue
            // and address, so cue words in admin free-text must not reinterpret it.
            const { end, start } = field === 'awardsCeremony'
                ? extractMoment(text, order)
                : extractWindow(text, order);

            return [text, start, end];
        };

        const accountRegWindow = sectionWindowText(sections, 'accountRegistration', order);
        // Older builds have no volunteer heading - judge and steward registration
        // is the second paragraph of the Account Registration section. Newer ones
        // give it a heading of its own, so prefer that and fall back.
        const volunteerRegWindow = sectionWindowText(sections, 'volunteerRegistration', order)
            || sectionParagraph(sections, 'accountRegistration', 1);
        const entryRegWindow = sectionWindowText(sections, 'entryRegistration', order);
        const numRequired = findBottleRequirement(sections);
        const dropOffWindow = sectionWindowText(sections, 'dropOff', order);
        const shippingWindow = sectionWindowText(sections, 'shipping', order);
        const awardsCeremony = sectionWindowText(sections, 'awardsCeremony', order);

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

        const data: (Date | string | undefined)[] = [
            ...windowFor('accountRegistration', accountRegWindow),
            ...windowFor('volunteerRegistration', volunteerRegWindow),
            ...windowFor('entryRegistration', entryRegWindow),
            numRequired,
            ...windowFor('dropOff', dropOffWindow),
            ...windowFor('shipping', shippingWindow),
            ...windowFor('awardsCeremony', awardsCeremony),
        ]

        const headerCsv = header.join('|');
        const dataCsv = data.map(value => formatField(value)).join('|');

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
