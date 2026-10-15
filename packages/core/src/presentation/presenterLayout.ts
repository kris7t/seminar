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

/** Largest width of a preview below the slide, in pixels. */
export const MAX_STACKED_PREVIEW_WIDTH = 480;

function fromWidth(width: number): Size {
  return { width, height: (width * SLIDE_HEIGHT) / SLIDE_WIDTH };
}

/** Returns the size of a preview whose slide has `height`, but at most as
 * wide as {@link MAX_STACKED_PREVIEW_WIDTH}. */
function stackedFromHeight(height: number): Size {
  return fromWidth(
    Math.min((height * SLIDE_WIDTH) / SLIDE_HEIGHT, MAX_STACKED_PREVIEW_WIDTH),
  );
}

function orZero(size: Size): Size {
  return size.width > 0 && size.height > 0 ? size : { width: 0, height: 0 };
}

/**
 * Returns the size of a preview of a slide in a panel whose contents, i.e.,
 * without its padding, have `content` size, or zero if it doesn't fit.
 *
 * Below the slide, previews fill the height of the panel, but they are at most
 * {@link MAX_STACKED_PREVIEW_WIDTH} wide, to leave space for the notes.
 */
export function previewSize(layout: PresenterLayout, content: Size): Size {
  return orZero(
    layout === 'side'
      ? fromWidth(content.width)
      : stackedFromHeight(content.height - HEADING_HEIGHT),
  );
}

/** Smallest width of a preview worth showing, in pixels. */
export const MIN_PREVIEW_WIDTH = 160;

/** How the panel shows the previews. */
export interface PreviewArrangement {
  /** The size of each preview. */
  size: Size;
  /** How many previews fit, at most as many as wanted. */
  count: number;
  /** Whether the previews are on top of each other or side by side. */
  direction: 'column' | 'row';
  /** Whether the notes are below the previews or next to them. */
  notes: 'below' | 'beside';
}

/**
 * Arranges previews below the slide next to the notes, shrinking a single
 * preview to leave enough width for the notes.
 */
function arrangeBeside(content: Size, wanted: number): PreviewArrangement {
  const size = previewSize('stacked', content);
  if (wanted >= 2) {
    const column = orZero(
      stackedFromHeight((content.height - PANEL_GAP) / 2 - HEADING_HEIGHT),
    );
    if (
      column.width > 0 &&
      column.width >= size.width &&
      content.width - column.width - PANEL_GAP >= MIN_NOTES_WIDTH
    ) {
      return { size: column, count: 2, direction: 'column', notes: 'beside' };
    }
    if (content.width - 2 * (size.width + PANEL_GAP) >= MIN_NOTES_WIDTH) {
      return { size, count: 2, direction: 'row', notes: 'beside' };
    }
  }
  return {
    size: orZero(
      fromWidth(
        Math.min(size.width, content.width - PANEL_GAP - MIN_NOTES_WIDTH),
      ),
    ),
    count: Math.min(wanted, 1),
    direction: 'column',
    notes: 'beside',
  };
}

/**
 * Arranges previews below the slide above the notes, e.g., in narrow windows,
 * leaving enough height for the notes. Two previews are side by side, shrunk
 * to fit the width if needed.
 */
function arrangeAbove(content: Size, wanted: number): PreviewArrangement {
  const height =
    content.height - 2 * HEADING_HEIGHT - PANEL_GAP - MIN_NOTES_HEIGHT;
  const width = Math.min(
    (height * SLIDE_WIDTH) / SLIDE_HEIGHT,
    content.width,
    MAX_STACKED_PREVIEW_WIDTH,
  );
  return wanted >= 2
    ? {
        size: orZero(
          fromWidth(Math.min(width, (content.width - PANEL_GAP) / 2)),
        ),
        count: 2,
        direction: 'row',
        notes: 'below',
      }
    : {
        size: orZero(fromWidth(width)),
        count: Math.min(wanted, 1),
        direction: 'column',
        notes: 'below',
      };
}

/**
 * How wide previews have to be compared to fewer, larger ones to show more of
 * them.
 */
const MORE_PREVIEWS_RATIO = 0.75;

/**
 * Chooses the arrangement with the largest previews, unless one with more
 * previews has ones nearly as large, since seeing the next step and the next
 * slide is worth some size.
 */
function chooseArrangement(
  arrangements: readonly [PreviewArrangement, ...PreviewArrangement[]],
): PreviewArrangement {
  const shown = arrangements.map((arrangement) =>
    arrangement.size.width < MIN_PREVIEW_WIDTH
      ? { ...arrangement, count: 0 }
      : arrangement,
  ) as [PreviewArrangement, ...PreviewArrangement[]];
  const largest = Math.max(...shown.map(({ size }) => size.width));
  return shown
    .filter(({ size }) => size.width >= MORE_PREVIEWS_RATIO * largest)
    .reduce((best, arrangement) =>
      arrangement.count > best.count ||
      (arrangement.count === best.count &&
        arrangement.size.width > best.size.width)
        ? arrangement
        : best,
    );
}

/**
 * Arranges `wanted` previews, e.g., of the next step and of the next slide, in
 * a panel whose contents have `content` size, while leaving enough space for
 * the notes. If two previews don't fit, only the first one is shown, and if
 * even that would be smaller than {@link MIN_PREVIEW_WIDTH}, none.
 *
 * Below the slide, the previews are next to the notes, unless the panel is so
 * narrow that they would be larger above the notes. Two previews next to the
 * notes are on top of each other if the panel is tall enough for them to be as
 * large as a single preview, and side by side otherwise. Two previews above
 * the notes are side by side, and they are preferred to a single one if they
 * are nearly as large (see {@link MORE_PREVIEWS_RATIO}).
 */
export function arrangePreviews(
  layout: PresenterLayout,
  content: Size,
  wanted: number,
): PreviewArrangement {
  if (layout === 'side') {
    const size = previewSize(layout, content);
    const previews = 2 * (HEADING_HEIGHT + size.height + PANEL_GAP);
    const two =
      wanted >= 2 &&
      content.height - previews - HEADING_HEIGHT >= MIN_NOTES_HEIGHT;
    return chooseArrangement([
      {
        size,
        count: two ? 2 : Math.min(wanted, 1),
        direction: 'column',
        notes: 'below',
      },
    ]);
  }
  return chooseArrangement([
    arrangeBeside(content, wanted),
    arrangeAbove(content, Math.min(wanted, 1)),
    ...(wanted >= 2 ? [arrangeAbove(content, wanted)] : []),
  ]);
}

/**
 * Chooses the layout of the presenter view in an area of `size`.
 *
 * Stacking makes the current slide as large as it can be, which matters for
 * slides with interactive widgets, but it only leaves the height below the
 * slide for the panel. So the slide is stacked above the panel only if the
 * preview of the next slide is at least as large as next to the slide, or
 * as large as previews below the slide can be.
 */
export function choosePresenterLayout({
  width,
  height,
}: Size): PresenterLayout {
  const slideHeight = (width * SLIDE_HEIGHT) / SLIDE_WIDTH;
  const stacked = arrangePreviews(
    'stacked',
    contentSize({ width, height: height - slideHeight }),
    1,
  ).size;
  const side = previewSize(
    'side',
    contentSize({ width: sidePanelWidth(width), height }),
  );
  return stacked.width > 0 &&
    stacked.width >= Math.min(side.width, MAX_STACKED_PREVIEW_WIDTH)
    ? 'stacked'
    : 'side';
}
