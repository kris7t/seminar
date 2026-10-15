import { Box, CssBaseline, ThemeProvider, type Theme } from '@mui/material';
import {
  Children,
  isValidElement,
  useCallback,
  useMemo,
  useState,
  type JSX,
  type ReactNode,
} from 'react';

import { DeckContext, type DeckState } from './DeckContext.ts';
import {
  defaultSlideTheme,
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
} from '../theme/createSlideTheme.ts';
import { useFitScale } from './useFitScale.ts';
import { useKeyboardNavigation } from '../interaction/useKeyboardNavigation.ts';
import { INTERACTIVE_ATTRIBUTE } from '../interaction/interaction.ts';
import { useClickNavigation } from '../interaction/useClickNavigation.ts';
import { useContextMenu } from '../interaction/useContextMenu.ts';
import { DeckMenu } from '../menu/DeckMenu.tsx';
import { GoToSlideDialog } from '../menu/GoToSlideDialog.tsx';
import { uiTheme } from '../menu/uiTheme.ts';
import { useDeckNavigation } from './useDeckNavigation.ts';
import { SlideStateContext } from '../state/SlideStateContext.ts';
import { SlideStateStore } from '../state/SlideStateStore.ts';
import { StepStoreContext } from '../steps/StepStoreContext.ts';
import { resolveToc, type TocEntry } from '../toc/tableOfContents.ts';
import { TocSidebar } from '../toc/TocSidebar.tsx';
import { SlideOverview } from '../overview/SlideOverview.tsx';
import { getSlideNotes } from '../notes/Notes.tsx';
import { NotesDisplay } from '../notes/NotesDisplay.tsx';
import {
  SLIDE_VIEW_ATTRIBUTE,
  type SlideView,
} from '../slide/SlideViewContext.ts';
import { SlideViewProvider } from '../slide/SlideViewProvider.tsx';

export interface DeckProps {
  /**
   * The slides of the deck, usually {@link Slide} elements.
   *
   * The `id` prop of a slide is used as the location hash when it is shown.
   */
  children?: ReactNode;
  /** MUI theme of the slides. Defaults to {@link defaultSlideTheme}. */
  theme?: Theme;
  /**
   * Whether clicking on the slides navigates initially (see
   * {@link useClickNavigation}). Defaults to `true`. The presenter can toggle
   * it in the context menu.
   *
   * With mouse navigation, text on the slides can't be selected, except in
   * text fields and elements with the `data-slider-interactive` attribute,
   * since selecting text with the mouse would interfere with clicking.
   */
  defaultMouseNavigation?: boolean;
  /**
   * The table of contents of the deck, which the presenter can show in a
   * sidebar from the context menu. Decks written in MDX get it from their
   * headings.
   */
  toc?: TocEntry[] | undefined;
  /** Whether the table of contents is shown initially. Defaults to `false`. */
  defaultShowToc?: boolean;
}

const SELECTABLE_SELECTOR = [
  `[${INTERACTIVE_ATTRIBUTE}]`,
  'input',
  'textarea',
  '[contenteditable]',
]
  .map((selector) => `& ${selector}`)
  .join(', ');

function getSlideId(slide: ReturnType<typeof Children.toArray>[number]) {
  if (isValidElement<{ id?: unknown }>(slide)) {
    const { id } = slide.props;
    if (typeof id === 'string' && id !== '') {
      return id;
    }
  }
  return undefined;
}

/**
 * Shows one of its child slides at a time, scaled to fit the viewport.
 */
export function Deck({
  children,
  theme = defaultSlideTheme,
  defaultMouseNavigation = true,
  toc: tocEntries,
  defaultShowToc = false,
}: DeckProps): JSX.Element {
  // Slides are positional children, so we need to index into them.
  // eslint-disable-next-line @eslint-react/no-children-to-array
  const slides = Children.toArray(children);
  const slideCount = slides.length;
  const slideIds = slides.map(getSlideId);
  const [slideState] = useState(() => new SlideStateStore());
  const {
    slideIndex,
    stepStore,
    goTo,
    next,
    previous,
    nextSlide,
    previousSlide,
    firstStep,
    lastStep,
  } = useDeckNavigation(slideIds, slideState);
  const toc = useMemo(() => {
    // eslint-disable-next-line @eslint-react/no-children-to-array
    const tocSlides = Children.toArray(children);
    return resolveToc(tocEntries ?? [], tocSlides, tocSlides.map(getSlideId));
  }, [tocEntries, children]);
  const [showToc, setShowToc] = useState(defaultShowToc);
  const [overviewShown, setOverviewShown] = useState(false);
  const showOverview = overviewShown;
  const [overviewIndex, setOverviewIndex] = useState(0);
  const setShowOverview = useCallback(
    (shown: boolean) => {
      if (shown) {
        setOverviewIndex(slideIndex);
      }
      setOverviewShown(shown);
    },
    [slideIndex, setOverviewIndex, setOverviewShown],
  );
  const view = useMemo<SlideView>(
    () => ({ index: slideIndex, kind: 'audience', interactive: true }),
    [slideIndex],
  );
  const [containerRef, scale, containerSize] = useFitScale(
    SLIDE_WIDTH,
    SLIDE_HEIGHT,
  );
  const notes = getSlideNotes(slides[slideIndex]);
  const [mouseNavigation, setMouseNavigation] = useState(
    defaultMouseNavigation,
  );
  const [menuPosition, onContextMenu, closeMenu] = useContextMenu();

  const deck = useMemo<DeckState>(
    () => ({
      slideIndex,
      slideCount,
      goTo,
      next,
      previous,
      nextSlide,
      previousSlide,
      firstStep,
      lastStep,
      mouseNavigation,
      setMouseNavigation,
      toc,
      showToc,
      setShowToc,
      showOverview,
      setShowOverview,
      overviewIndex,
      setOverviewIndex,
    }),
    [
      slideIndex,
      slideCount,
      goTo,
      next,
      previous,
      nextSlide,
      previousSlide,
      firstStep,
      lastStep,
      mouseNavigation,
      toc,
      showToc,
      showOverview,
      setShowOverview,
      overviewIndex,
      setMouseNavigation,
      setShowToc,
      setOverviewIndex,
    ],
  );
  const [goToSlideOpen, setGoToSlideOpen] = useState(false);
  const openGoToSlide = useCallback(() => {
    setGoToSlideOpen(true);
  }, []);
  const closeGoToSlide = useCallback(() => {
    setGoToSlideOpen(false);
  }, []);
  useKeyboardNavigation(deck, { onGoToSlide: openGoToSlide });
  const onClick = useClickNavigation(next, previous);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <DeckContext value={deck}>
        <SlideStateContext value={slideState}>
          <StepStoreContext value={stepStore}>
            <Box sx={{ position: 'fixed', inset: 0, display: 'flex' }}>
              {showToc && toc.length > 0 && (
                // Outside of the slides, so that clicks don't navigate.
                <ThemeProvider theme={uiTheme}>
                  <TocSidebar
                    onClose={() => {
                      setShowToc(false);
                    }}
                  />
                </ThemeProvider>
              )}
              <Box
                ref={containerRef}
                onClick={mouseNavigation ? onClick : undefined}
                onContextMenu={onContextMenu}
                sx={[
                  {
                    position: 'relative',
                    flex: 1,
                    minWidth: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    bgcolor: 'common.black',
                  },
                  mouseNavigation && {
                    userSelect: 'none',
                    [SELECTABLE_SELECTOR]: { userSelect: 'text' },
                  },
                ]}
              >
                <Box
                  sx={{
                    flex: 'none',
                    position: 'relative',
                    width: SLIDE_WIDTH,
                    height: SLIDE_HEIGHT,
                    overflow: 'hidden',
                    bgcolor: 'background.default',
                    color: 'text.primary',
                  }}
                  style={{ transform: `scale(${String(scale)})` }}
                  {...{ [SLIDE_VIEW_ATTRIBUTE]: view.kind }}
                >
                  {/* The overview shows the slide instead. */}
                  {!showOverview && (
                    <SlideViewProvider key={slideIndex} view={view}>
                      {slides[slideIndex]}
                    </SlideViewProvider>
                  )}
                </Box>
                {notes !== undefined && !showOverview && (
                  <NotesDisplay
                    // Collapse the notes on another slide.
                    key={slideIndex}
                    notes={notes}
                    size={containerSize}
                    scale={scale}
                  />
                )}
              </Box>
            </Box>
            {showOverview && (
              <SlideOverview
                slides={slides}
                onClose={() => {
                  setShowOverview(false);
                }}
                onContextMenu={onContextMenu}
              />
            )}
            {/* Outside of the slides, so that events don't bubble to them. */}
            <ThemeProvider theme={uiTheme}>
              <DeckMenu
                anchorPosition={menuPosition}
                onClose={closeMenu}
                onGoToSlide={openGoToSlide}
              />
              <GoToSlideDialog open={goToSlideOpen} onClose={closeGoToSlide} />
            </ThemeProvider>
          </StepStoreContext>
        </SlideStateContext>
      </DeckContext>
    </ThemeProvider>
  );
}
