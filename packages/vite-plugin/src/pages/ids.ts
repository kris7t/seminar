/**
 * IDs of the elements of the page of a deck, and the comments that mark its
 * parts, which the colophon tells tools about, so they are shared by the parts
 * that generate and describe the page.
 */

/**
 * ID of the element at the start of the body that holds the contents of the
 * deck as HTML, for clients without JavaScript, like text extractors.
 */
export const CONTENT_ID = 'seminar-content';

/** ID of the colophon at the start of the content, see `writeColophon`. */
export const COLOPHON_ID = 'seminar-colophon';

/** ID of the note that the script of the page adds to the colophon. */
export const RENDERED_NOTE_ID = 'seminar-colophon-rendered';

/** ID of the `pre` element that holds the Markdown of the deck. */
export const MARKDOWN_ID = 'seminar-markdown';

/** ID of the `main` element of the content of the deck. */
export const MAIN_ID = 'seminar-main';

/** ID of the element that the deck is rendered into. */
export const ROOT_ID = 'seminar-root';

/** ID of the link at the start of the page that skips to the content. */
export const SKIP_ID = 'seminar-skip';

/**
 * ID of the area of the slide, the `main` element of the rendered deck (see
 * `Deck` in `@seminar/core`).
 */
export const SLIDES_ID = 'seminar-slides';

/**
 * ID of the element in the body of the page that holds the style sheets of
 * self-contained pages, which Vite would otherwise add to the head.
 */
export const STYLESHEETS_ID = 'seminar-stylesheets';

/**
 * ID of the element in the body of the page that holds the styles of Emotion,
 * which would otherwise be added to the head.
 */
export const EMOTION_ID = 'seminar-emotion';

/** ID of the element that holds the images embedded into a page. */
export const IMAGES_ID = 'seminar-images';

/** Prefix of the IDs of the images embedded into a page. */
export const IMAGE_PREFIX = 'seminar-image-';

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
