import { wrapLines } from './documents.ts';

/** What the content of a page is, which its colophon describes. */
export interface ColophonContent {
  /**
   * The deck rendered as a document, its source as Markdown (see
   * `deckMarkdown` in `@seminar/mdx`), or both, the Markdown first.
   */
  kind: 'document' | 'markdown' | 'both';
  /** The title of the deck. */
  title: string;
  /** The language of the deck, as a BCP 47 tag, if it's known. */
  lang?: string | undefined;
  /** The label that the colophon is shown under, see {@link writeColophon}. */
  label: string;
  /** The language of `label`, if it isn't that of the deck. */
  labelLang?: string | undefined;
  /** How many slides the document has. */
  slides?: number | undefined;
  /** The id of the heading of a slide in the document, as an example. */
  example?: string | undefined;
  /** Whether the document has presenter notes. */
  notes?: boolean | undefined;
  /** The name of a component in the Markdown, as an example. */
  component?: string | undefined;
  /** How many formulas the document has as MathML. */
  formulas?: number | undefined;
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
  /** The images of the document. */
  images?: ColophonImages | undefined;
  /** The images of the Markdown, without `withoutAlt`. */
  markdownImages?: ColophonImages | undefined;
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
 * nor the escaped Markdown of a deck can have comments, so the markers of the
 * colophon can't occur in them.
 */
export const CONTENT_END = '<!--seminar-content-end-->';

/**
 * Marks the end of the Markdown of a deck before its document, like
 * {@link CONTENT_END}.
 */
export const MARKDOWN_END = '<!--seminar-markdown-end-->';

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

/** Returns the `lang` attribute of an element in `lang`, if it's known. */
function langAttribute(lang: string | undefined): string {
  return lang === undefined
    ? ''
    : ` lang="${escapeHtml(lang).replaceAll('"', '&quot;')}"`;
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
 * Returns the line of the colophon about the images of the slides: how many
 * there are, whether they have alt text, where their data is, so that tools
 * can look at them, and how the Markdown and the HTML of the page refer to
 * them. The HTML tells about alt text, which the Markdown has in the text.
 */
function imagesLine(
  images: ColophonImages | undefined,
  markdownImages: ColophonImages | undefined,
): string | undefined {
  const shown = images ?? markdownImages;
  if (shown === undefined || shown.count === 0) {
    return undefined;
  }
  const { count, embedded } = shown;
  const alt =
    images === undefined
      ? ''
      : images.withoutAlt === 0
        ? count === 1
          ? ', with alt text'
          : ', all with alt text'
        : `, ${String(images.withoutAlt)} without alt text`;
  const markdown =
    markdownImages === undefined
      ? undefined
      : embedded === undefined
        ? 'the Markdown links to them'
        : 'the Markdown refers to each image as `![Alt text](#seminar-image-N)`';
  const html =
    images === undefined
      ? undefined
      : embedded === undefined
        ? 'the HTML shows each image as an `<img>` with its alt text in `alt`'
        : `the HTML shows ${markdown === undefined ? 'each image' : 'it'} as an \`<svg role="img">\` with the alt text in \`aria-label\` and a \`<use href="#seminar-image-N">\``;
  const references = [markdown, html].filter(
    (reference) => reference !== undefined,
  );
  const where =
    embedded === undefined
      ? 'The images are separate files'
      : `The image data is base64 ${embedded.join('/')} in \`<image id="seminar-image-N">\` elements inside \`<svg id="seminar-images">\` after the content, which text extraction drops`;
  const sentence = references.join(', and ');
  return `Images: there ${count === 1 ? 'is 1' : `are ${String(count)}`}${alt}. ${where}. ${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
}

/** The website of Seminar, which the colophon links to. */
const SEMINAR_URL = 'https://seminar.run';

/**
 * The summary of the syntax of decks in the documentation, which the colophon
 * of the Markdown of decks links to for their directives.
 */
const SYNTAX_URL = `${SEMINAR_URL}/guide/getting-started#syntax-at-a-glance`;

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
 * deck, and text, unlike a comment, so that text extractors keep it. It's
 * collapsed in a `details` element under its label, which is in the language
 * of the user interface, so that people can skip it.
 *
 * The content is between the placeholder and {@link CONTENT_END}, which stays
 * in the page for tools that read its source, while the other markers are
 * removed. With both the Markdown and the document of the deck, the Markdown
 * ends with {@link MARKDOWN_END}, which stays, too, and the colophon tells
 * the lines of both. Leaves pages without the markers as they are.
 */
export function writeColophon(
  html: string,
  { images, markdownImages }: ColophonFollowing = {},
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
  const hasDocument = deck.kind !== 'markdown';
  const hasMarkdown = deck.kind !== 'document';
  const lines = [
    // The URLs are in the text, too, so that tools can follow them after
    // text extraction.
    `This is a slide deck made with {seminar} ({seminarUrl}): {title}${slides}${lang}.${
      deck.kind === 'both'
        ? ' The page contains it twice: once as Markdown source, and once as rendered HTML.'
        : ''
    }`,
  ];
  // Where tools that read the Markdown wonder what its components show, which
  // they would otherwise guess, e.g., that an interactive one starts empty.
  const componentsInMarkdown =
    hasMarkdown && deck.component !== undefined
      ? ` Components such as \`<${deck.component}>\` appear as written, so anything they compute or keep as state, like their initial values, is not in the Markdown${
          deck.kind === 'both'
            ? '; the HTML below has them rendered in place'
            : ''
        }.`
      : undefined;
  // The Markdown first, which comes first in the page.
  if (hasMarkdown) {
    lines.push(
      `${
        deck.kind === 'both'
          ? `Markdown: the \`<pre>\` in \`<details>\` on lines \0start\0–\0markdownEnd\0, ending at \`${MARKDOWN_END}\` (within the first \0markdownSize\0 of the page).`
          : `Markdown: the \`<pre>\` in \`<main>\` on lines \0start\0–\0end\0, ending at \`${CONTENT_END}\` (within the first \0size\0 of the page).`
      } Directives use the generic syntax: \`:name[label]{attributes}\` inline, \`::name[label]{attributes}\` on their own line, and \`:::name[label]{attributes}\` … \`:::\` around blocks, as documented at {syntax}.${componentsInMarkdown ?? ''}`,
    );
  }
  if (hasDocument) {
    const components =
      componentsInMarkdown === undefined
        ? ' Interactive components are rendered in place.'
        : '';
    const heading =
      deck.example === undefined
        ? ''
        : ', and the `id` of its heading links to it in the deck, e.g., `#{example}`';
    lines.push(
      `HTML: the \`<main>\` on lines \0${deck.kind === 'both' ? 'mainStart' : 'start'}\0–\0end\0, ending at \`${CONTENT_END}\` (within the first \0size\0 of the page). Each slide is a \`<section>\`${deck.notes === true ? ', with its speaker notes in an `<aside>`' : ''}${heading}.${components}`,
    );
    if (deck.formulas !== undefined && deck.formulas > 0) {
      lines.push(
        `Formulas: there ${deck.formulas === 1 ? 'is 1' : `are ${String(deck.formulas)}`} in the HTML, as MathML \`<math>\` with the TeX source in \`<annotation encoding="application/x-tex">\`, so text extraction may show both.`,
      );
    }
  }
  const imageLine = imagesLine(
    hasDocument ? images : undefined,
    hasMarkdown ? markdownImages : undefined,
  );
  if (imageLine !== undefined) {
    lines.push(imageLine);
  }
  const parts = [...rest.matchAll(PART_PATTERN)].map(([, part = '']) => part);
  if (parts.length > 0) {
    lines.push(
      `After the content come ${list(parts)}, about ${formatSize(
        Buffer.byteLength(rest.replaceAll(PART_PATTERN, '')),
      )}.`,
    );
  }
  // Values that the text can't have, as it's escaped, and which are filled
  // in after formatting, so that they stay text, or markup.
  const values = new Map<string, string>([
    ['seminar', `<a href="${SEMINAR_URL}">Seminar</a>`],
    ['seminarUrl', `<a href="${SEMINAR_URL}">${SEMINAR_URL}</a>`],
    ['syntax', `<a href="${SYNTAX_URL}">${SYNTAX_URL}</a>`],
    // In the language of the deck, unlike the colophon.
    [
      'title',
      `<cite${langAttribute(deck.lang)}>${escapeHtml(deck.title)}</cite>`,
    ],
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
    `<details><summary${langAttribute(deck.labelLang)}>${escapeHtml(deck.label).replaceAll('\0', '')}</summary>\n<p id="seminar-colophon" lang="en">${lines.map(text).join('<br>\n')}</p>\n</details>`,
  )}\n`;
  const contentStart = before.length + colophon.length;
  const contentEnd = contentStart + content.length;
  const markdownEnd = deck.kind === 'both' ? content.indexOf(MARKDOWN_END) : -1;
  const page = before + colophon + content;
  const numbers = new Map([
    ['start', String(lineAt(page, before.length + 1))],
    ['end', String(lineAt(page, contentEnd))],
  ]);
  if (markdownEnd >= 0) {
    numbers.set(
      'markdownEnd',
      String(lineAt(page, contentStart + markdownEnd)),
    );
    numbers.set(
      'mainStart',
      String(
        lineAt(
          page,
          contentStart +
            Math.max(
              content.indexOf('<main', markdownEnd),
              markdownEnd + MARKDOWN_END.length,
            ),
        ),
      ),
    );
  }
  const fill = (size: string, markdownSize: string) =>
    colophon.replace(/\0(\w+)\0/g, (_, name: string) =>
      name === 'size'
        ? size
        : name === 'markdownSize'
          ? markdownSize
          : (numbers.get(name) ?? ''),
    );
  // The sizes of the content include the colophon, whose size depends on the
  // sizes it shows by a few bytes, so this measures them with the longest.
  const longest = before + fill('1000 KB', '1000 KB');
  const size = formatSize(Buffer.byteLength(longest + content));
  const markdownSize = formatSize(
    Buffer.byteLength(
      longest + content.slice(0, markdownEnd + MARKDOWN_END.length),
    ),
  );
  return (
    before +
    fill(size, markdownSize) +
    content +
    CONTENT_END +
    rest.replaceAll(PART_PATTERN, '')
  );
}
