import type { MdxJsxFlowElement } from 'mdast-util-mdx';
import type { MdxJsxFlowElementHast } from 'mdast-util-mdx-jsx';

/*
 * Names that the compiled deck imports the components of `@slider/core` as,
 * which are unlikely to clash with the names in the document.
 */

export const DECK = '_SliderDeck';
export const SLIDE = '_SliderSlide';
export const STEP = '_SliderStep';
export const LIST_ITEM = '_SliderListItem';
export const PARAGRAPH = '_SliderParagraph';
export const IMAGE = '_SliderImage';
export const SLIDE_ELEMENT = '_SliderSlideElement';
export const NOTES = '_SliderNotes';
/** Name of the default theme of the deck, if it has one. */
export const THEME = '_SliderTheme';

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
