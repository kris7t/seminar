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
  useEffect,
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
import { useWheelNavigation } from '../interaction/useWheelNavigation.ts';
import { useContextMenu } from '../interaction/useContextMenu.ts';
import { composeHandlers } from '../interaction/composeHandlers.ts';
import { usePinchIn } from '../interaction/usePinchIn.ts';
import { ScreenDialog } from '../presentation/ScreenDialog.tsx';
import { AudienceWindow } from '../presentation/AudienceWindow.tsx';
import {
  createPointerStore,
  MirroredPointer,
  usePointerTracking,
  type PointerMode,
} from '../presentation/pointer.tsx';
import { createInteractionStore } from '../presentation/mirror/interactionState.ts';
import { useInteractionCapture } from '../presentation/mirror/useInteractionCapture.ts';
import { PresenterPanel } from '../presentation/PresenterPanel.tsx';
import { PresenterToolbar } from '../presentation/PresenterToolbar.tsx';
import {
  choosePresenterLayout,
  SIDE_PANEL_WIDTH,
} from '../presentation/presenterLayout.ts';
import { usePresentation } from '../presentation/usePresentation.ts';
import { usePresenterView } from '../presentation/usePresenterView.ts';
import { correctRipples } from '../slide/rippleScale.ts';
import { SlideMirror } from '../slide/SlideMirror.tsx';
import { SelectionFrame } from '../slide/SelectionFrame.tsx';
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
import { uiTheme } from '../menu/uiTheme.ts';
import { UiThemeProvider } from '../menu/UiThemeProvider.tsx';
import { useDeckNavigation } from './useDeckNavigation.ts';
import { SlideStateContext } from '../state/SlideStateContext.ts';
import { SlideStateStore } from '../state/SlideStateStore.ts';
import { StepStoreContext } from '../steps/StepStoreContext.ts';
import { resolveToc, type TocEntry } from '../toc/tableOfContents.ts';
import { Sidebar, type SidebarSection } from '../sidebar/Sidebar.tsx';
import { StepTree } from '../steps/StepTree.tsx';
import { TocList } from '../toc/TocList.tsx';
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
  /**
   * Whether the steps of the current slide are shown initially. Defaults to
   * `false`.
   */
  defaultShowSteps?: boolean;
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

function isSpare(slide: ReturnType<typeof Children.toArray>[number]) {
  return (
    isValidElement<{ spare?: unknown }>(slide) && slide.props.spare === true
  );
}

/**
 * Returns `spares`, or the previous value if it has the same elements, so
 * that it's stable while the spare slides don't change.
 */
function useSpares(spares: readonly boolean[]): readonly boolean[] {
  const [stable, setStable] = useState(spares);
  const changed =
    stable.length !== spares.length ||
    stable.some((spare, index) => spare !== spares[index]);
  if (changed) {
    setStable(spares);
  }
  return changed ? spares : stable;
}

/**
 * Shows one of its child slides at a time, scaled to fit the viewport.
 *
 * Going through the deck skips spare slides (see the `spare` prop of
 * {@link Slide}).
 */
export function Deck({
  children,
  theme = defaultSlideTheme,
  defaultMouseNavigation = true,
  toc: tocEntries,
  defaultShowToc = false,
  defaultShowSteps = false,
}: DeckProps): JSX.Element {
  // Slides are positional children, so we need to index into them.
  // eslint-disable-next-line @eslint-react/no-children-to-array
  const slides = Children.toArray(children);
  const slideCount = slides.length;
  const slideIds = slides.map(getSlideId);
  const spares = useSpares(slides.map(isSpare));
  const [slideState] = useState(() => new SlideStateStore());
  const {
    slideIndex,
    stepStore,
    atFirstStep,
    atLastStep,
    nextSlideIndex,
    previousSlideIndex,
    firstSlideIndex,
    lastSlideIndex,
    goTo,
    next,
    previous,
    nextSlide,
    previousSlide,
    firstStep,
    lastStep,
  } = useDeckNavigation(slideIds, spares, slideState);
  const toc = useMemo(() => {
    // eslint-disable-next-line @eslint-react/no-children-to-array
    const tocSlides = Children.toArray(children);
    return resolveToc(tocEntries ?? [], tocSlides, tocSlides.map(getSlideId));
  }, [tocEntries, children]);
  const [showToc, setShowToc] = useState(defaultShowToc);
  const [showSteps, setShowSteps] = useState(defaultShowSteps);
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
  const [pointer] = useState(createPointerStore);
  const [pointerMode, setPointerMode] = useState<PointerMode>('mirror');
  // The mode to return to when the laser pointer is turned off.
  const [modeBeforeLaser, setModeBeforeLaser] = useState<PointerMode>('mirror');
  const pointerHandlers = usePointerTracking(pointer, pointerMode);
  const [interaction] = useState(createInteractionStore);
  const [presenterFrame, setPresenterFrame] = useState<HTMLElement | null>(
    null,
  );
  // Hover, focus, and the caret belong to the mirrored pointer. Otherwise, the
  // audience only sees the state of the slide, like the text of fields.
  // The deck always shows its slide scaled.
  useEffect(
    () =>
      presenterFrame === null ? undefined : correctRipples(presenterFrame),
    [presenterFrame],
  );
  useInteractionCapture(
    presenting && pointerMode === 'mirror' ? presenterFrame : null,
    interaction,
  );
  const toggleMirrorPointer = useCallback(() => {
    setPointerMode(pointerMode === 'mirror' ? 'off' : 'mirror');
  }, [pointerMode, setPointerMode]);
  const toggleLaserPointer = useCallback(() => {
    if (pointerMode === 'laser') {
      setPointerMode(modeBeforeLaser);
    } else {
      setModeBeforeLaser(pointerMode);
      setPointerMode('laser');
    }
  }, [pointerMode, modeBeforeLaser, setPointerMode, setModeBeforeLaser]);
  // The time elapsed counts from when the presenter view was opened, or from
  // when it was last reset, whichever is later.
  const [timerResetAt, setTimerResetAt] = useState(0);
  const timerStart = Math.max(
    presenterView.audience?.openedAt ?? 0,
    timerResetAt,
  );
  const resetTimer = useCallback(() => {
    setTimerResetAt(Date.now());
  }, []);
  // Collapsing all sections hides the sidebar.
  const sidebarSections: SidebarSection[] = [
    ...(toc.length === 0
      ? []
      : [
          {
            key: 'toc',
            title: 'Contents',
            expanded: showToc,
            onToggle: () => {
              setShowToc(!showToc);
            },
            children: <TocList />,
          },
        ]),
    {
      key: 'steps',
      title: 'Steps',
      expanded: showSteps,
      onToggle: () => {
        setShowSteps(!showSteps);
      },
      children: <StepTree store={stepStore} />,
    },
  ];
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
      atFirstStep,
      atLastStep,
      nextSlideIndex,
      previousSlideIndex,
      firstSlideIndex,
      lastSlideIndex,
      spares,
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
      showSteps,
      setShowSteps,
      showOverview,
      setShowOverview,
      overviewIndex,
      setOverviewIndex,
    }),
    [
      slideIndex,
      slideCount,
      atFirstStep,
      atLastStep,
      nextSlideIndex,
      previousSlideIndex,
      firstSlideIndex,
      lastSlideIndex,
      spares,
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
      showSteps,
      setShowSteps,
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
  // Only used in the presenter view.
  const onMirrorPointer = useCallback(() => {
    if (presenting) {
      toggleMirrorPointer();
    }
    return presenting;
  }, [presenting, toggleMirrorPointer]);
  const onLaserPointer = useCallback(() => {
    if (presenting) {
      toggleLaserPointer();
    }
    return presenting;
  }, [presenting, toggleLaserPointer]);
  const onResetTimer = useCallback(() => {
    if (presenting) {
      resetTimer();
    }
    return presenting;
  }, [presenting, resetTimer]);
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
    onMirrorPointer,
    onLaserPointer,
    onResetTimer,
    onEscape,
  });
  const onClick = useClickNavigation(next, previous);
  const onWheel = useWheelNavigation(next, previous);
  const swipe = useSwipeNavigation({
    hasMoreSteps: () => stepStore.hasNext(),
    canGoNext: nextSlideIndex !== undefined,
    canGoPrevious: previousSlideIndex !== undefined,
    nextSlide,
    previousSlide,
    width: containerSize.width,
    slideWidth: SLIDE_WIDTH * scale,
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
              {sidebarSections.some(({ expanded }) => expanded) && (
                // Outside of the slides, so that clicks don't navigate. Dark
                // like the rest of the presenter view.
                <UiThemeProvider dark={presenting}>
                  <Sidebar sections={sidebarSections} />
                </UiThemeProvider>
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
                    onWheel={mouseNavigation ? onWheel : undefined}
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
                        (
                          [
                            [previousSlideIndex, -1],
                            [nextSlideIndex, 1],
                          ] as const
                        )
                          .flatMap(([index, side]) =>
                            index === undefined ? [] : [[index, side] as const],
                          )
                          .map(([index, side]) => (
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
                                left: `${String(side * 100)}%`,
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
                      <SelectionFrame
                        ref={setPresenterFrame}
                        sx={SLIDE_FRAME_STYLES}
                        style={{
                          transform: `scale(${String(scale)})`,
                          // The laser pointer replaces the mouse cursor.
                          ...(presenting && pointerMode === 'laser'
                            ? { cursor: 'none' }
                            : {}),
                        }}
                        {...{ [SLIDE_VIEW_ATTRIBUTE]: view.kind }}
                        // Show the pointer of the presenter to the audience.
                        {...(presenting ? pointerHandlers : {})}
                      >
                        {/* The overview shows the slide instead. */}
                        {!showOverview && (
                          <SlideViewProvider key={slideIndex} view={view}>
                            {slides[slideIndex]}
                          </SlideViewProvider>
                        )}
                        {/* The presenter sees the laser pointer, too. */}
                        {presenting && pointerMode === 'laser' && (
                          <MirroredPointer store={pointer} mode="laser" />
                        )}
                      </SelectionFrame>
                    </Box>
                    {/* Doesn't move with the slides. */}
                    <ThemeProvider theme={uiTheme}>
                      <SwipeHint open={swipe.showHint} />
                    </ThemeProvider>
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
                    <UiThemeProvider dark>
                      <Box
                        // Clicking the panel navigates, too, so that the
                        // presenter can advance without the mouse pointer
                        // showing on the slide. Only the toolbar has controls.
                        onClick={mouseNavigation ? onClick : undefined}
                        onWheel={mouseNavigation ? onWheel : undefined}
                        {...menuHandlers}
                        sx={[
                          { display: 'flex', minWidth: 0, minHeight: 0 },
                          stacked
                            ? { flex: 1 }
                            : { flex: 'none', width: SIDE_PANEL_WIDTH },
                          mouseNavigation && { userSelect: 'none' },
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
                    </UiThemeProvider>
                  )}
                </Box>
                {presenting && (
                  <UiThemeProvider dark>
                    <PresenterToolbar
                      width={presenterAreaSize.width}
                      timerStart={timerStart}
                      onResetTimer={resetTimer}
                      onGoToSlide={openGoToSlide}
                      notesOnly={notesOnly}
                      setNotesOnly={setNotesOnly}
                      pointerMode={pointerMode}
                      onMirrorPointer={toggleMirrorPointer}
                      onLaserPointer={toggleLaserPointer}
                      menuOpen={menuPosition !== undefined}
                      onOpenMenu={openMenu}
                    />
                  </UiThemeProvider>
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
              {/* The presenter view has a menu button in its toolbar. */}
              {!presenting && (
                <MenuButton
                  open={menuPosition !== undefined}
                  onOpen={openMenu}
                />
              )}
              <DeckMenu
                anchorPosition={menuPosition}
                onClose={closeMenu}
                onGoToSlide={openGoToSlide}
                onPresent={presentation.toggle}
                presenterView={presenting}
                onPresenterView={presenterView.toggle}
                presenterSettings={
                  presenting
                    ? {
                        notesOnly,
                        onFocusNotes,
                        pointerMode,
                        onMirrorPointer: toggleMirrorPointer,
                        onLaserPointer: toggleLaserPointer,
                        onResetTimer: resetTimer,
                      }
                    : undefined
                }
              />
              <GoToSlideDialog open={goToSlideOpen} onClose={closeGoToSlide} />
              {presenterView.audience !== undefined && (
                <AudienceWindow
                  audience={presenterView.audience}
                  slides={slides}
                  theme={theme}
                  onClose={presenterView.close}
                  pointer={pointer}
                  pointerMode={pointerMode}
                  interaction={interaction}
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
