import type { Size } from '../deck/useFitScale.ts';
import { SLIDE_HEIGHT, SLIDE_WIDTH } from '../theme/createSlideTheme.ts';

/**
 * How the presenter view lays out the current slide and the panel with the
 * upcoming slides and the notes:
 *
 * - `'stacked'`: the slide takes the whole width, with the panel below it,
 *   where the previews and the notes are side by side.
 * - `'side'`: the panel is next to the slide, with the previews above the
 *   notes.
 */
export type PresenterLayout = 'stacked' | 'side';

/** Padding of the panel, in pixels. */
export const PANEL_PADDING = 16;

/** Space between the parts of the panel, in pixels. */
export const PANEL_GAP = 16;

/** Height of a heading in the panel and the space below it, in pixels. */
export const HEADING_HEIGHT = 32;

/** Width of the panel next to the slide, as a CSS length. */
export const SIDE_PANEL_WIDTH = 'clamp(280px, 33%, 640px)';

/** Height the notes need below the previews next to the slide, in pixels. */
const MIN_NOTES_HEIGHT = 160;

/** Width the notes need next to the previews below the slide, in pixels. */
const MIN_NOTES_WIDTH = 320;

function sidePanelWidth(areaWidth: number): number {
  return Math.min(Math.max(280, areaWidth / 3), 640);
}

/** Removes the padding of the panel from its size. */
function contentSize({ width, height }: Size): Size {
  return {
    width: width - 2 * PANEL_PADDING,
    height: height - 2 * PANEL_PADDING,
  };
}

/**
 * Returns the size of a preview of a slide in a panel whose contents, i.e.,
 * without its padding, have `content` size, or zero if it doesn't fit.
 */
export function previewSize(layout: PresenterLayout, content: Size): Size {
  const size =
    layout === 'side'
      ? { width: content.width, height: Number.NaN }
      : { width: Number.NaN, height: content.height - HEADING_HEIGHT };
  if (Number.isNaN(size.height)) {
    size.height = (size.width * SLIDE_HEIGHT) / SLIDE_WIDTH;
  } else {
    size.width = (size.height * SLIDE_WIDTH) / SLIDE_HEIGHT;
  }
  return size.width > 0 && size.height > 0 ? size : { width: 0, height: 0 };
}

/**
 * Whether a panel whose contents have `content` size fits two previews, e.g.,
 * of the next step and of the next slide, while leaving enough space for the
 * notes.
 */
export function fitsTwoPreviews(
  layout: PresenterLayout,
  content: Size,
): boolean {
  const preview = previewSize(layout, content);
  if (layout === 'side') {
    const previews = 2 * (HEADING_HEIGHT + preview.height + PANEL_GAP);
    return content.height - previews - HEADING_HEIGHT >= MIN_NOTES_HEIGHT;
  }
  const previews = 2 * (preview.width + PANEL_GAP);
  return content.width - previews >= MIN_NOTES_WIDTH;
}

/**
 * Chooses the layout of the presenter view in an area of `size`.
 *
 * Stacking makes the current slide as large as it can be, which matters for
 * slides with interactive widgets, but it only leaves the height below the
 * slide for the panel. So the slide is stacked above the panel only if the
 * preview of the next slide is at least as large as next to the slide.
 */
export function choosePresenterLayout({
  width,
  height,
}: Size): PresenterLayout {
  const slideHeight = (width * SLIDE_HEIGHT) / SLIDE_WIDTH;
  const stacked = previewSize(
    'stacked',
    contentSize({ width, height: height - slideHeight }),
  );
  const side = previewSize(
    'side',
    contentSize({ width: sidePanelWidth(width), height }),
  );
  return stacked.width > 0 && stacked.width >= side.width ? 'stacked' : 'side';
}
