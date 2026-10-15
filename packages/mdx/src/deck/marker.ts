/**
 * Name of the intrinsic JSX element that {@link remarkSlides} wraps slide
 * titles in, and that {@link recmaSlideTitles} turns into the `title` prop of
 * the slide.
 *
 * It contains a dash, so MDX treats it as an intrinsic element and doesn't
 * look it up among the components.
 */
export const SLIDE_TITLE_MARKER = 'slider-slide-title';
