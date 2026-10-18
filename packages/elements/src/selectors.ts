/**
 * Matches the first child of its parent, like `:first-child`, but skips the
 * `style` elements that Emotion inserts before elements when rendering on
 * the server, which `:first-child` would match instead.
 */
export const FIRST_CHILD = ':not(style):not(:not(style) ~ *)';
