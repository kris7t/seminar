/** What the content of a page is, which its colophon describes. */
export interface ColophonContent {
  /** The deck rendered as a document, or its source. */
  kind: 'document' | 'source';
  /** Whether the document has presenter notes. */
  notes?: boolean | undefined;
}

/** What a page has after its content, which its colophon describes. */
export interface ColophonFollowing {
  /** The types of the images embedded after the content, e.g., `PNG`. */
  images?: readonly string[] | undefined;
  /** Whether fonts are inlined after the content. */
  fonts?: boolean | undefined;
  /** Whether scripts are inlined after the content. */
  scripts?: boolean | undefined;
}

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
 * Replaces the placeholder of the colophon in `html` with a paragraph that
 * describes the page, e.g., to AI tools that only read the beginning of a
 * file: where the content of the deck is, how large it is, and what is
 * `following` it. It's in English, whatever the language of the deck, and
 * text, unlike a comment, so that text extractors keep it.
 *
 * The content is between the placeholder and {@link CONTENT_END}, which is
 * removed. Leaves pages without them as they are.
 */
export function writeColophon(
  html: string,
  { images = [], fonts = false, scripts = false }: ColophonFollowing = {},
): string {
  const start = START_PATTERN.exec(html);
  const end = start === null ? -1 : html.indexOf(CONTENT_END, start.index);
  if (start === null || end < 0) {
    return html;
  }
  const lines = [
    start[1] === 'document'
      ? `Slide content: \`<main>\`, about the first SIZE.${start[2] === undefined ? '' : ' Speaker notes in `<aside>`.'}`
      : 'The MDX source of the deck: `<main>`, about the first SIZE.',
  ];
  if (images.length > 0) {
    lines.push(
      `Images: \`<use href="#seminar-image-N">\` refers to \`<image id="seminar-image-N">\` in \`<svg id="seminar-images">\` (base64 ${images.join('/')}) after the slides.`,
    );
  }
  const before = html.slice(0, start.index);
  const content = html.slice(start.index + start[0].length, end);
  const rest = html.slice(end + CONTENT_END.length);
  const following = [
    ...(images.length > 0 ? ['images'] : []),
    ...(fonts ? ['fonts'] : []),
    ...(scripts ? ['scripts'] : []),
  ];
  if (following.length > 0) {
    lines.push(
      `Followed by ${list(following)} (about ${formatSize(Buffer.byteLength(rest))}).`,
    );
  }
  const colophon = (size: string) =>
    `<p id="seminar-colophon" lang="en">${lines
      .map((line) => formatLine(line.replace('SIZE', size)))
      .join('<br>')}</p>`;
  // The size of the content includes the colophon, whose size depends on the
  // size it shows by a few bytes, so this measures it with the longest size.
  const size = formatSize(
    Buffer.byteLength(before + colophon('1000 KB') + content),
  );
  return before + colophon(size) + content + rest;
}
