import {
  Box,
  CssBaseline,
  keyframes,
  ThemeProvider,
  type Theme,
} from '@mui/material';
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
import { composeHandlers } from '../interaction/composeHandlers.ts';
import { usePinchIn } from '../interaction/usePinchIn.ts';
import { ScreenDialog } from '../presentation/ScreenDialog.tsx';
import { AudienceWindow } from '../presentation/AudienceWindow.tsx';
import { PresenterPanel } from '../presentation/PresenterPanel.tsx';
import { PresenterToolbar } from '../presentation/PresenterToolbar.tsx';
import {
  choosePresenterLayout,
  SIDE_PANEL_WIDTH,
} from '../presentation/presenterLayout.ts';
import { usePresentation } from '../presentation/usePresentation.ts';
import { usePresenterView } from '../presentation/usePresenterView.ts';
import { SlideMirror } from '../slide/SlideMirror.tsx';
import { SLIDE_FRAME_STYLES } from '../slide/slideFrame.ts';
import { SwipeHint } from '../swipe/SwipeHint.tsx';
import {
  ENTER_DURATION,
  SETTLE_DURATION,
  useSwipeNavigation,
} from '../swipe/useSwipeNavigation.ts';
import { DeckMenu } from '../menu/DeckMenu.tsx';
import { MenuButton } from '../menu/MenuButton.tsx';
import { GoToSlideDialog } from '../menu/GoToSlideDialog.tsx';
import { darkUiTheme, uiTheme } from '../menu/uiTheme.ts';
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

/** Slides the slide in from `--slider-enter-from` after a swipe. */
const enter = keyframes`
  from {
    translate: var(--slider-enter-from) 0;
  }
`;

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
  const presenterView = usePresenterView();
  const presenting = presenterView.audience !== undefined;
  const [presenterAreaRef, , presenterAreaSize] = useFitScale(
    SLIDE_WIDTH,
    SLIDE_HEIGHT,
  );
  // Doesn't depend on what the panel shows, so that focusing on the notes
  // doesn't resize the slide.
  const presenterLayout = choosePresenterLayout(presenterAreaSize);
  const [notesOnly, setNotesOnly] = useState(false);
  const stacked = presenting && presenterLayout === 'stacked';
  const view = useMemo<SlideView>(
    () => ({
      index: slideIndex,
      // The audience window shows the slide to the audience instead.
      kind: presenting ? 'presenter' : 'audience',
      interactive: true,
    }),
    [slideIndex, presenting],
  );
  const [containerRef, scale, containerSize] = useFitScale(
    SLIDE_WIDTH,
    SLIDE_HEIGHT,
  );
  const notes = getSlideNotes(slides[slideIndex]);
  const [mouseNavigation, setMouseNavigation] = useState(
    defaultMouseNavigation,
  );
  const [menuPosition, menuHandlers, openMenu, closeMenu] = useContextMenu();

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
  const presentation = usePresentation(presenterView);
  const closePresenterView = presenterView.close;
  const onEscape = useCallback(() => {
    if (!presenting) {
      return false;
    }
    closePresenterView();
    return true;
  }, [presenting, closePresenterView]);
  const onFocusNotes = useCallback(() => {
    if (!presenting) {
      return false;
    }
    setNotesOnly(!notesOnly);
    return true;
  }, [presenting, notesOnly, setNotesOnly]);
  useKeyboardNavigation(deck, {
    onGoToSlide: openGoToSlide,
    onPresent: presentation.toggle,
    onPresenterView: presenterView.toggle,
    onFocusNotes,
    onEscape,
  });
  const onClick = useClickNavigation(next, previous);
  const swipe = useSwipeNavigation({
    hasMoreSteps: () => stepStore.hasNext(),
    canGoNext: slideIndex < slideCount - 1,
    canGoPrevious: slideIndex > 0,
    nextSlide,
    previousSlide,
    width: containerSize.width,
    disabled:
      menuPosition !== undefined ||
      showOverview ||
      goToSlideOpen ||
      presentation.screens !== undefined,
  });
  // Zooming out of the slide shows all slides.
  const pinchHandlers = usePinchIn(
    () => {
      setShowOverview(true);
    },
    menuPosition !== undefined || showOverview || goToSlideOpen,
  );

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
              {/*
               * Always rendered, so that the slide isn't remounted when the
               * presenter view opens or closes.
               */}
              <Box
                sx={{
                  flex: 1,
                  minWidth: 0,
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <Box
                  ref={presenterAreaRef}
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    minHeight: 0,
                    display: 'flex',
                    flexDirection: stacked ? 'column' : 'row',
                  }}
                >
                  <Box
                    ref={containerRef}
                    onClick={mouseNavigation ? onClick : undefined}
                    {...composeHandlers(
                      composeHandlers(menuHandlers, swipe.handlers),
                      pinchHandlers,
                    )}
                    sx={[
                      {
                        position: 'relative',
                        flex: 1,
                        minWidth: 0,
                        minHeight: 0,
                        overflow: 'hidden',
                        bgcolor: 'common.black',
                        // Long presses open our context menu instead.
                        WebkitTouchCallout: 'none',
                        // Horizontal swipes change the slide.
                        touchAction: 'pan-y pinch-zoom',
                      },
                      // As large as the slide, which takes the whole width.
                      stacked && {
                        flex: 'none',
                        aspectRatio: `${String(SLIDE_WIDTH)} / ${String(SLIDE_HEIGHT)}`,
                      },
                      mouseNavigation && {
                        userSelect: 'none',
                        [SELECTABLE_SELECTOR]: { userSelect: 'text' },
                      },
                    ]}
                  >
                    {/* Moves the slides together while swiping. */}
                    <Box
                      // Restarts the animation of sliding in on another slide.
                      key={`slides-${String(slideIndex)}`}
                      onTransitionEnd={(event) => {
                        if (event.target === event.currentTarget) {
                          swipe.onTransitionEnd();
                        }
                      }}
                      onAnimationEnd={(event) => {
                        if (event.target === event.currentTarget) {
                          swipe.onAnimationEnd();
                        }
                      }}
                      sx={[
                        { position: 'absolute', inset: 0 },
                        swipe.transition === 'settle' && {
                          transition: `translate ${String(SETTLE_DURATION)}ms ease-out`,
                        },
                        swipe.enterFrom !== undefined && {
                          animation: `${enter} ${String(ENTER_DURATION)}ms ease-out`,
                        },
                      ]}
                      style={{
                        translate: `${String(swipe.offset)}px 0`,
                        ...(swipe.enterFrom === undefined
                          ? {}
                          : {
                              '--slider-enter-from': `${String(swipe.enterFrom)}px`,
                            }),
                      }}
                    >
                      {swipe.moving &&
                        !showOverview &&
                        [slideIndex - 1, slideIndex + 1]
                          .filter((index) => index >= 0 && index < slideCount)
                          .map((index) => (
                            // Placed a whole area away, which needs no measuring.
                            <Box
                              key={index}
                              inert
                              sx={{
                                position: 'absolute',
                                top: 0,
                                bottom: 0,
                                width: '100%',
                              }}
                              style={{
                                left: `${String((index - slideIndex) * 100)}%`,
                              }}
                            >
                              <Box
                                sx={SLIDE_FRAME_STYLES}
                                style={{ transform: `scale(${String(scale)})` }}
                                {...{ [SLIDE_VIEW_ATTRIBUTE]: 'preview' }}
                              >
                                <SlideMirror
                                  index={index}
                                  slide={slides[index]}
                                  kind="preview"
                                />
                              </Box>
                            </Box>
                          ))}
                      <Box
                        sx={SLIDE_FRAME_STYLES}
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
                    </Box>
                    {/* The presenter view shows the notes in its panel instead. */}
                    {notes !== undefined && !showOverview && !presenting && (
                      <NotesDisplay
                        // Collapse the notes on another slide.
                        key={`notes-${String(slideIndex)}`}
                        notes={notes}
                        size={containerSize}
                        scale={scale}
                      />
                    )}
                  </Box>
                  {presenting && (
                    // Outside of the slides, so that clicks don't navigate.
                    <ThemeProvider theme={darkUiTheme}>
                      <Box
                        sx={[
                          { display: 'flex', minWidth: 0, minHeight: 0 },
                          stacked
                            ? { flex: 1 }
                            : { flex: 'none', width: SIDE_PANEL_WIDTH },
                        ]}
                      >
                        <PresenterPanel
                          slides={slides}
                          notes={notes}
                          slideTheme={theme}
                          layout={presenterLayout}
                          notesOnly={notesOnly}
                        />
                      </Box>
                    </ThemeProvider>
                  )}
                </Box>
                {presenting && (
                  <ThemeProvider theme={darkUiTheme}>
                    <PresenterToolbar
                      onGoToSlide={openGoToSlide}
                      notesOnly={notesOnly}
                      setNotesOnly={setNotesOnly}
                    />
                  </ThemeProvider>
                )}
              </Box>
            </Box>
            {showOverview && (
              <SlideOverview
                slides={slides}
                onClose={() => {
                  setShowOverview(false);
                }}
                menuHandlers={menuHandlers}
              />
            )}
            {/* Outside of the slides, so that events don't bubble to them. */}
            <ThemeProvider theme={uiTheme}>
              <MenuButton open={menuPosition !== undefined} onOpen={openMenu} />
              <DeckMenu
                anchorPosition={menuPosition}
                onClose={closeMenu}
                onGoToSlide={openGoToSlide}
                onPresent={presentation.toggle}
                presenterView={presenting}
                onPresenterView={presenterView.toggle}
              />
              <GoToSlideDialog open={goToSlideOpen} onClose={closeGoToSlide} />
              <SwipeHint open={swipe.showHint} />
              {presenterView.audience !== undefined && (
                <AudienceWindow
                  audience={presenterView.audience}
                  slides={slides}
                  theme={theme}
                  onClose={presenterView.close}
                />
              )}
              <ScreenDialog
                screens={presentation.screens}
                onChoose={presentation.choose}
                onClose={presentation.cancel}
              />
            </ThemeProvider>
          </StepStoreContext>
        </SlideStateContext>
      </DeckContext>
    </ThemeProvider>
  );
}
