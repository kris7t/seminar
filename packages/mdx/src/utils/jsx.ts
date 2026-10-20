import type { MdxJsxFlowElement } from 'mdast-util-mdx';
import type { MdxJsxFlowElementHast } from 'mdast-util-mdx-jsx';

/*
 * Names that the compiled deck imports the components of `@seminar/core` as,
 * which are unlikely to clash with the names in the document.
 */

export const DECK = '_SeminarDeck';

/** Name of the options of the deck in the browser, see `recmaSeminarOptions`. */
export const SEMINAR_OPTIONS = '_seminarOptions';
export const SLIDE = '_SeminarSlide';
export const STEP = '_SeminarStep';
export const LIST_ITEM = '_SeminarListItem';
export const PARAGRAPH = '_SeminarParagraph';
export const IMAGE = '_SeminarImage';
export const SLIDE_ELEMENT = '_SeminarSlideElement';
export const NOTES = '_SeminarNotes';
/** Name of the default theme of the deck, if it has one. */
export const THEME = '_SeminarTheme';

/**
 * Marks generated JSX elements as written explicitly, like JSX in the MDX
 * source. Otherwise, MDX treats them like elements generated from Markdown,
 * which can be replaced with the `components` passed to the document. In
 * particular, the slide title marker wouldn't be compiled to a string tag.
 */
export const EXPLICIT_JSX = {
  _mdxExplicitJsx: true,
} as MdxJsxFlowElement['data'];

/** {@link EXPLICIT_JSX} for JSX elements in hast. */
export const EXPLICIT_JSX_HAST = EXPLICIT_JSX as MdxJsxFlowElementHast['data'];
