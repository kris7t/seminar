import { wrapLines } from './documents.ts';

/** What the content of a page is, which its colophon describes. */
export interface ColophonContent {
  /** The deck rendered as a document, or its source. */
  kind: 'document' | 'source';
  /** The title of the deck. */
  title: string;
  /** The language of the deck, as a BCP 47 tag, if it's known. */
  lang?: string | undefined;
  /** How many slides the document has. */
  slides?: number | undefined;
  /** The id of the heading of a slide in the document, as an example. */
  example?: string | undefined;
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
 * tells about, see {@link writeColophon}.
 */
export function partMarker(part: PagePart): string {
  return `<!--seminar-part:${part}-->`;
}

const PART_PATTERN = /<!--seminar-part:(fonts|styles|images|scripts)-->/g;

/**
 * Marks the end of the content of a page, which stays in the page, so that
 * tools that read its source can find it. Neither documents rendered by React
 * nor the escaped source of a deck can have comments, so the markers of the
 * colophon can't occur in them.
 */
export const CONTENT_END = '<!--seminar-content-end-->';

const START_PATTERN = /<!--seminar-colophon:([\w.~%]*)-->/;

/**
 * Returns the placeholder of the colophon, which marks the start of the
 * content of a page, see {@link writeColophon}, with `content` encoded, so
 * that it can't end the comment.
 */
export function colophonStart(content: ColophonContent): string {
  return `<!--seminar-colophon:${encodeURIComponent(
    JSON.stringify(content),
  ).replaceAll(
    /[!'()*-]/g,
    (character) =>
      `%${(character.codePointAt(0) ?? 0).toString(16).toUpperCase()}`,
  )}-->`;
}

/** Returns the name of the language `lang` in English, e.g., `Hungarian`. */
function languageName(lang: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(lang) ?? lang;
  } catch {
    return lang;
  }
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
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
      : `Each is an \`<svg role="img">\` with its alt text in \`aria-label\` and its title in \`<title>\`, whose \`<use href="#seminar-image-N">\` refers to \`<image id="seminar-image-N">\` in \`<svg id="seminar-images">\` (base64 ${embedded.join('/')}) after the slides. Their content is only in the image data`;
  return `Images: the slides have ${String(count)} ${count === 1 ? 'image' : 'images'}, ${alt}. ${shown}, which text extraction leaves out.`;
}

/** The website of Seminar, which the colophon links to. */
const SEMINAR_URL = 'https://seminar.run';

/** Id of the note that the script of the page adds to the colophon. */
export const RENDERED_NOTE_ID = 'seminar-colophon-rendered';

/**
 * Returns the note that the script of the page adds to the end of the
 * colophon, once it renders the deck, so that it's only in the page as the
 * browser shows it, e.g., when it's saved from the browser: that the slides
 * follow the content as they are rendered. It's on the last line of the
 * colophon, so that the lines of the content stay the same.
 */
export function renderedNote(rootId: string): string {
  return `<br><span id="${RENDERED_NOTE_ID}">${formatLine(
    `\`<div id="${rootId}">\` after the content has the slides as the browser rendered them.`,
  )}</span>`;
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
 * large it is, and which parts follow it, which are marked with
 * {@link partMarker}. Their lines aren't told, since pages saved from the
 * browser have the slides rendered before them. It's in English, whatever the language of the
 * deck, and text, unlike a comment, so that text extractors keep it.
 *
 * The content is between the placeholder and {@link CONTENT_END}, which stays
 * in the page for tools that read its source, while the other markers are
 * removed. Leaves pages without them as they are.
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
  const deck = JSON.parse(
    decodeURIComponent(start[1] ?? ''),
  ) as ColophonContent;
  const before = html.slice(0, start.index);
  const content = html.slice(start.index + start[0].length, end);
  const rest = html.slice(end + CONTENT_END.length);
  const slides =
    deck.slides === undefined
      ? ''
      : `, ${String(deck.slides)} ${deck.slides === 1 ? 'slide' : 'slides'}`;
  const lang = deck.lang === undefined ? '' : ` in ${languageName(deck.lang)}`;
  const lines = [
    `A slide deck made with {seminar}: “{title}”${slides}${lang}.`,
    deck.kind === 'document'
      ? `Slide content: \`<main>\` on lines \0start\0–\0end\0 up to \`${CONTENT_END}\`, with a \`<section>\` for each slide, about the first \0size\0.${deck.notes === true ? ' Speaker notes in an `<aside>` in the section of their slide.' : ''}`
      : `The MDX source of the deck: \`<main>\` on lines \0start\0–\0end\0 up to \`${CONTENT_END}\`, about the first \0size\0.`,
  ];
  if (deck.kind === 'document' && deck.example !== undefined) {
    lines.push(
      'The `id` of the heading of each slide is its link in the deck, e.g., `#{example}`.',
    );
  }
  if (images !== undefined && images.count > 0) {
    lines.push(imagesLine(images));
  }
  const parts = [...rest.matchAll(PART_PATTERN)].map(([, part = '']) => part);
  if (parts.length > 0) {
    lines.push(
      `Followed by ${list(parts)}, about ${formatSize(
        Buffer.byteLength(rest.replaceAll(PART_PATTERN, '')),
      )}.`,
    );
  }
  // Values that the text can't have, as it's escaped, and which are filled
  // in after formatting, so that they stay text, or markup.
  const values = new Map<string, string>([
    ['seminar', `<a href="${SEMINAR_URL}">Seminar</a>`],
    ['title', escapeHtml(deck.title)],
    ['example', escapeHtml(deck.example ?? '')],
  ]);
  const text = (line: string) =>
    formatLine(line).replace(/\{(\w+)\}/g, (placeholder, name: string) =>
      // NUL marks the numbers below, so the values can't have it.
      (values.get(name) ?? placeholder).replaceAll('\0', ''),
    );
  // On lines of its own, whose numbers don't change its lines, so the lines
  // can be found with placeholders.
  const colophon = `\n${wrapLines(
    `<p id="seminar-colophon" lang="en">${lines.map(text).join('<br>\n')}</p>`,
  )}\n`;
  const contentEnd = before.length + colophon.length + content.length;
  const page = before + colophon + content;
  const numbers = new Map([
    ['start', String(lineAt(page, before.length + 1))],
    ['end', String(lineAt(page, contentEnd))],
  ]);
  const fill = (size: string) =>
    colophon.replace(/\0(\w+)\0/g, (_, name: string) =>
      name === 'size' ? size : (numbers.get(name) ?? ''),
    );
  // The size of the content includes the colophon, whose size depends on the
  // size it shows by a few bytes, so this measures it with the longest size.
  const size = formatSize(
    Buffer.byteLength(before + fill('1000 KB') + content),
  );
  return (
    before +
    fill(size) +
    content +
    CONTENT_END +
    rest.replaceAll(PART_PATTERN, '')
  );
}
