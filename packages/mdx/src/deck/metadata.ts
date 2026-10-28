/**
 * What the frontmatter of a deck tells about it, e.g., for the meta tags of
 * its HTML page, or the headers of its printed pages.
 */
export interface DeckMetadata {
  /** Title of the deck, which defaults to its first heading. */
  title?: string;
  /** Authors of the deck. */
  authors?: string[];
  /** The event where the deck is presented, e.g., a conference. */
  event?: string;
  /** Date of the presentation, as written. */
  date?: string;
  /** A short description of the deck. */
  description?: string;
  /** Keywords of the deck. */
  keywords?: string[];
}

/** Reads a text, which YAML may also parse as a number, e.g., a year. */
function readText(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value.trim() === '' ? undefined : value.trim();
  }
  return typeof value === 'number' ? String(value) : undefined;
}

/** Reads a list of texts, or a single text with items separated by `,`. */
function readTexts(value: unknown, split: boolean): string[] | undefined {
  const values: unknown[] = Array.isArray(value)
    ? value
    : split && typeof value === 'string'
      ? value.split(',').filter((item) => item.trim() !== '')
      : [value];
  const items = values.flatMap((item) => {
    const text = readText(item);
    return text === undefined ? [] : [text];
  });
  return items.length > 0 && items.length === values.length ? items : undefined;
}

/**
 * Returns the metadata of a deck from its frontmatter (see
 * `getDeckFrontmatter`):
 *
 * - `title`: the title.
 * - `author`: an author, or a list of authors.
 * - `event`: the event where the deck is presented.
 * - `date`: the date of the presentation, as written.
 * - `description`: a short description.
 * - `keywords`: a list of keywords, or keywords separated by `,`.
 *
 * Calls `report` with a message for each key with a value of the wrong type,
 * which is left out.
 */
export function getDeckMetadata(
  frontmatter: Record<string, unknown>,
  report: (message: string) => void = () => undefined,
): DeckMetadata {
  const metadata: DeckMetadata = {};
  const check = <T>(
    key: string,
    value: T | undefined,
    expected: string,
  ): T | undefined => {
    if (value === undefined && frontmatter[key] !== undefined) {
      report(`Expected \`${key}\` in the frontmatter to be ${expected}`);
    }
    return value;
  };
  for (const [key, field] of [
    ['title', 'title'],
    ['event', 'event'],
    ['date', 'date'],
    ['description', 'description'],
  ] as const) {
    const value = check(key, readText(frontmatter[key]), 'a text');
    if (value !== undefined) {
      metadata[field] = value;
    }
  }
  const authors = check(
    'author',
    readTexts(frontmatter['author'], false),
    'a name or a list of names',
  );
  if (authors !== undefined) {
    metadata.authors = authors;
  }
  const keywords = check(
    'keywords',
    readTexts(frontmatter['keywords'], true),
    'a list of keywords',
  );
  if (keywords !== undefined) {
    metadata.keywords = keywords;
  }
  return metadata;
}
