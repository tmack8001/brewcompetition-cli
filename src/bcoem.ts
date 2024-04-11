import cheerio from 'cheerio';
import moment from 'moment-timezone';

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
    // Add more mappings as needed
  };

  return timezoneMap[abbreviation] || moment.tz.guess();
}

function extractDateWindow(dateString: string): {endDate: Date | undefined, startDate: Date | undefined} {
  // Regular expression to match dates in the format "Day, Month Date, Year Time, TimeZone"
  const dateRegex = /(today)|(?:(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday), ([A-Za-z]+) (\d{1,2}), (\d{4}) (\d{1,2}:\d{2} [AP]M), ([A-Za-z]+)\.)/g;

  // Array to store parsed dates
  const dates = [];

  const matches = dateString.matchAll(dateRegex);
  for (const match of matches) {
    if (match[1]) {
      // If "today" is matched, set start date to today
      dates.push(moment().toDate());
    } else {
      // Otherwise, parse the second date
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [_, __, dayOfWeek, month, day, year, time, timeZone] = match; // Ignoring the first two match groups
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

export async function parseMetadata(html: string) {
  const $ = cheerio.load(html)
  const accountRegWindow = $('a[name="reg_window"]').nextAll('p').eq(0).text(); // first paragraph is entrant window
  const volunteerRegWindow = $('a[name="reg_window"]').nextAll('p').eq(1).text(); // second paragraph is volunteers
  const entryRegWindow = $('a[name="entry-registration"]').nextAll('p').eq(0).text(); // entry registration
  const numRequired = $('a[name="entry-acceptance-rules"]').nextAll('p').eq(0).text(); // num bottles
  const dropOffWindow = $('a[name="drop-off-locations"]').nextAll('p').eq(0).text(); // drop off window
  const shippingWindow = $('a[name="shipping-info"]').nextAll('p').eq(0).text(); // shipping window
  const awardsCeremony = $('a[name="awards-ceremony"]').nextAll('p').eq(0).text(); // awards ceremony

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

  // Convert to CSV format
  const headerCsv = header.join('|');
  const dataCsv = data.join('|');

  return {
      data: dataCsv,
      header: headerCsv,
  };
}

export async function parseResults(html: string, tableSelector: string, filters: { brewers: string | undefined, club: string | undefined }) {
  const $ = cheerio.load(html)
  const table = $(tableSelector)

  if (!table || table.length === 0) {
    console.error('Table not found');
    return;
  }

  const header: string[] = [];
  const data: string[][] = [];

  // for each winning table
  $(`${tableSelector}`).each((index, element) => {
    
    const tableName: string = $(element).find(`h3`).text().trim().replaceAll(',', '');
    if (tableName.includes("Brewers") || tableName.includes("Clubs")) {
      // do nothing;
    } else {
      if (header.length === 0) {
        header.push("Table / Category")
      }

      // extract headers
      if (header.length < 6) { // table, place, brewer, name, style, club 
        $(element).find(`table thead tr th`).each((index, element) => {
          header.push($(element).text().trim());
        });
      }

      // Extract data
      $(element).find(`table tbody tr`).each((index, row) => {
        let include : boolean = false
      
        // brewer is specified and no club == only brewer
        // brewer is not specified and no club == return everything
        // brewer is not specific and club = only club
        if (((filters.brewers && filters.club) || (!filters.brewers)) && // Filter by club if provided
          !include && (!filters.club || $($(row).find('td')[4]).text() === filters.club)) { // index 4 = Club
            include = true
        }
        
        if (!include && (filters.brewers && // index 1 = Brewer
          filters.brewers.split(',').includes($($(row).find('td')[1]).text().replaceAll(' MHP', '')))) {
          include = true
        }
        
        if (include) {
          const rowData: string[] = [];
          rowData.push(tableName);
        
          $(row).find('td').each((index, element) => {
            const cellText = $(element).text().trim().replaceAll(',', ''); // Remove commas
            rowData.push(cellText.replaceAll(' MHP', '')); // BCOEM appends ' MHP' to brewer when opted into
          });
          data.push(rowData);
        }
      });
    }
  })

  // Convert to CSV format
  const headerCsv = header.join('|');
  const dataCsv = data.map(row => row.join('|')).join('\n');

  return {
      data: dataCsv,
      header: headerCsv,
  };
}
