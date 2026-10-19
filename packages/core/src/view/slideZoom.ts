/**
 * CSS custom property with the `zoom` of the frame of a slide, where slides
 * are scaled with `zoom` (see `slideScaleStyles`), and unset elsewhere.
 *
 * WebKit resolves `em` in an `svg` element with a `font-size` of its own as
 * if the slide weren't zoomed, so sizes in `em` there should be multiplied
 * by it, e.g., `calc(1em * var(--slider-zoom, 1))`.
 */
export const SLIDE_ZOOM_PROPERTY = '--slider-zoom';
