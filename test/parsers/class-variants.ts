import type { Element } from 'cheerio';

import cheerio from 'cheerio';

export type ClassVariant = 'misleading' | 'original' | 'scrambled' | 'stripped' | 'unattributed';

export const CLASS_VARIANTS: ClassVariant[] = ['original', 'stripped', 'scrambled', 'misleading', 'unattributed'];

/**
 * Rewrites the presentation attributes of a page, so a parser that reads
 * anything but text and structure gives a different answer.
 *
 * @param html the page
 * @param variant `stripped` removes class, `scrambled` replaces it with nonsense,
 *   `misleading` gives every element the class the old parser keyed on and hides it, and
 *   `unattributed` removes every attribute
 * @returns the rewritten page
 */
export function withClasses(html: string, variant: ClassVariant): string {
  if (variant === 'original') return html;

  const $ = cheerio.load(html);
  $('*').each((index, node) => {
    const element = node as Element;
    switch (variant) {
    case 'misleading': {
      Object.assign(element.attribs, { 'aria-hidden': 'true', class: 'bcoem-winner-table d-none jss95 MuiCard-root', hidden: '', id: `sortable${index}`, style: 'display:none' });
      break;
    }

    case 'scrambled': {
      element.attribs.class = `zz${(index * 7919) % 1009} qq${index}`;
      delete element.attribs.id;
      break;
    }

    case 'stripped': {
      delete element.attribs.class;
      break;
    }

    default: {
      element.attribs = {};
    }
    }
  });

  return $.html();
}
