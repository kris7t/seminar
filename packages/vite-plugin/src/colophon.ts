import { wrapLines } from './documents.ts';

/** What the content of a page is, which its colophon describes. */
export interface ColophonContent {
  /** The deck rendered as a document, or its source. */
  kind: 'document' | 'source';
  /** Whether the document has presenter notes. */
  notes?: boolean | undefined;
}

/** The images of the content of a page, which its colophon describes. */
export interface ColophonImages {
  /** How many images the content shows. */
  count: number;
  /** How many of them have no alt text. */
  withoutAlt: number;
  /**
   * The types of the images embedded after the content, e.g., `PNG`, if the
   * content shows them from there, rather than as `img` elements.
   */
  embedded?: readonly string[] | undefined;
}

/** What a page has besides its content, which its colophon describes. */
export interface ColophonFollowing {
  images?: ColophonImages | undefined;
}

/** A part of a page after its content, see {@link partMarker}. */
export type PagePart = 'fonts' | 'styles' | 'images' | 'scripts';

/**
 * Returns the marker of where `part` starts in a page, which the colophon
 * tells the line of, see {@link writeColophon}.
 */
export function partMarker(part: PagePart): string {
  return `<!--seminar-part:${part}-->`;
}

const PART_PATTERN = /<!--seminar-part:(fonts|styles|images|scripts)-->/g;

/**
 * Marks the end of the content of a page. Neither documents rendered by React
 * nor the escaped source of a deck can have comments, so the markers of the
 * colophon can't occur in them.
 */
export const CONTENT_END = '<!--seminar-content-end-->';

const START_PATTERN = /<!--seminar-colophon:(document|source)(:notes)?-->/;

/**
 * Returns the placeholder of the colophon, which marks the start of the
 * content of a page, see {@link writeColophon}.
 */
export function colophonStart({
  kind,
  notes = false,
}: ColophonContent): string {
  return `<!--seminar-colophon:${kind}${notes ? ':notes' : ''}-->`;
}

/**
 * Formats a size in bytes for people, e.g., `115 KB` or `6.4 MB`, rounding
 * up, so that tools that read as much as it says don't stop short.
 */
function formatSize(bytes: number): string {
  if (bytes <= 1000 * 1000) {
    return `${String(Math.max(1, Math.ceil(bytes / 1000)))} KB`;
  }
  const megabytes = bytes / 1000 / 1000;
  return megabytes <= 10
    ? `${(Math.ceil(megabytes * 10) / 10).toFixed(1)} MB`
    : `${String(Math.ceil(megabytes))} MB`;
}

/** Joins words into a list, e.g., `images, fonts, and scripts`. */
function list(words: readonly string[]): string {
  return words.length <= 2
    ? words.join(' and ')
    : `${words.slice(0, -1).join(', ')}, and ${words.at(-1) ?? ''}`;
}

/**
 * Formats a line of the colophon, escaping it and showing the parts in
 * backticks, like tags, as code.
 */
function formatLine(line: string): string {
  return line
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll(/`([^`]*)`/g, '<code>$1</code>');
}

/**
 * Returns the line of the colophon about `images`: how many there are, where
 * their alt text is, so that tools don't miss it, and that their content is
 * only in their data.
 */
function imagesLine({ count, withoutAlt, embedded }: ColophonImages): string {
  const alt =
    withoutAlt === 0
      ? count === 1
        ? 'with alt text'
        : 'all with alt text'
      : `${String(withoutAlt)} without alt text`;
  const shown =
    embedded === undefined
      ? 'Each is an `<img>` with its alt text in `alt`. Their content is only in the image files'
      : `Each is an \`<svg role="img">\` with its alt text in \`aria-label\` and its title in \`<title>\`, whose \`<use href="#seminar-image-N">\` refers to \`<image id="seminar-image-N">\` in \`<svg id="seminar-images">\` (base64 ${embedded.join('/')}) on line {images}. Their content is only in the image data`;
  return `Images: the slides have ${String(count)} ${count === 1 ? 'image' : 'images'}, ${alt}. ${shown}, which text extraction leaves out.`;
}

/** Returns the line of the character at `index` of `text`, from 1. */
function lineAt(text: string, index: number): number {
  let line = 1;
  for (
    let i = text.indexOf('\n');
    i >= 0 && i < index;
    i = text.indexOf('\n', i + 1)
  ) {
    line += 1;
  }
  return line;
}

/**
 * Replaces the placeholder of the colophon in `html` with a paragraph that
 * describes the page, e.g., to AI tools that only read the beginning of a
 * file, or some of its lines: on which lines the content of the deck is, how
 * large it is, and where the parts that follow it start, which are marked
 * with {@link partMarker}. It's in English, whatever the language of the
 * deck, and text, unlike a comment, so that text extractors keep it.
 *
 * The content is between the placeholder and {@link CONTENT_END}. The markers
 * are removed. Leaves pages without them as they are.
 */
export function writeColophon(
  html: string,
  { images }: ColophonFollowing = {},
): string {
  const start = START_PATTERN.exec(html);
  const end = start === null ? -1 : html.indexOf(CONTENT_END, start.index);
  if (start === null || end < 0) {
    return html;
  }
  const before = html.slice(0, start.index);
  const content = html.slice(start.index + start[0].length, end);
  const rest = html.slice(end + CONTENT_END.length);
  const lines = [
    start[1] === 'document'
      ? `Slide content: \`<main>\` on lines {start}–{end}, about the first {size}.${start[2] === undefined ? '' : ' Speaker notes in `<aside>`.'}`
      : 'The MDX source of the deck: `<main>` on lines {start}–{end}, about the first {size}.',
  ];
  if (images !== undefined && images.count > 0) {
    lines.push(imagesLine(images));
  }
  const parts = [...rest.matchAll(PART_PATTERN)].map(([, part = '']) => part);
  if (parts.length > 0) {
    lines.push(
      `Followed by ${list(parts.map((part) => `${part} (line {${part}})`))}, about ${formatSize(
        Buffer.byteLength(rest.replaceAll(PART_PATTERN, '')),
      )}.`,
    );
  }
  // On lines of its own, whose numbers don't change its lines, so the lines
  // can be found with placeholders.
  const colophon = `\n${wrapLines(
    `<p id="seminar-colophon" lang="en">${lines.map(formatLine).join('<br>\n')}</p>`,
  )}\n`;
  let page = before + colophon + content + rest;
  const values = new Map<string, string>([
    ['start', String(lineAt(page, before.length + 1))],
    [
      'end',
      String(lineAt(page, before.length + colophon.length + content.length)),
    ],
  ]);
  for (const match of page.matchAll(PART_PATTERN)) {
    values.set(match[1] ?? '', String(lineAt(page, match.index)));
  }
  page = page.replaceAll(PART_PATTERN, '');
  const fill = (text: string, size: string) =>
    text.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
      name === 'size' ? size : (values.get(name) ?? placeholder),
    );
  // The size of the content includes the colophon, whose size depends on the
  // size it shows by a few bytes, so this measures it with the longest size.
  const contentEnd = before.length + colophon.length + content.length;
  const size = formatSize(
    Buffer.byteLength(fill(page.slice(0, contentEnd), '1000 KB')),
  );
  return fill(page.slice(0, contentEnd), size) + page.slice(contentEnd);
}
