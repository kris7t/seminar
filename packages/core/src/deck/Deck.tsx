import {
  Box,
  CssBaseline,
  GlobalStyles,
  keyframes,
  ThemeProvider,
  type Theme,
} from '@mui/material';
import {
  Children,
  isValidElement,
  use,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type JSX,
  type ReactNode,
} from 'react';

import { DeckContext, type DeckState } from './DeckContext.ts';
import type { DeckMetadata } from './DeckMetadata.ts';
import { DeckDocumentContext, DocumentDeck } from './DeckDocument.tsx';
import {
  SeminarOptionsContext,
  type SeminarOptions,
} from './SeminarOptionsContext.ts';
import {
  defaultSlideTheme,
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
} from '../theme/createSlideTheme.ts';
import { getAliases, resolveRecaps } from './recaps.ts';
import { getFadeBetween, getStepFade } from '../transitions/slideFades.ts';
import { useFitScale } from '../view/useFitScale.ts';
import { useKeyboardNavigation } from '../interaction/useKeyboardNavigation.ts';
import {
  INTERACTIVE_ATTRIBUTE,
  SELECTABLE_ATTRIBUTE,
} from '../interaction/interaction.ts';
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
} from '../presentation/mirror/pointer.tsx';
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
import { correctRipples } from '../view/rippleScale.ts';
import { SlideMirror } from '../view/SlideMirror.tsx';
import {
  getFadeTransition,
  SlideTransitions,
  SlideTransitionsContext,
} from '../transitions/SlideTransitions.ts';
import { SlideTransitionStyles } from '../transitions/SlideTransitionStyles.tsx';
import {
  FITTED_SLIDE_FRAME_STYLES,
  pixelBoxStyles,
  slideScaleStyles,
  titleBarMargins,
} from '../view/slideFrame.ts';
import { SwipeHint } from '../interaction/SwipeHint.tsx';
import {
  ENTER_DURATION,
  SETTLE_DURATION,
  useSwipeNavigation,
} from '../interaction/useSwipeNavigation.ts';
import { DeckMenu } from '../menu/DeckMenu.tsx';
import { getSeminarHost } from '../host/SeminarHost.ts';
import { PrintDialog } from '../print/PrintDialog.tsx';
import {
  PrintView,
  type PrintedDocument,
  type PrintOptions,
} from '../print/PrintView.tsx';
import { DeckTitleBar } from '../menu/DeckTitleBar.tsx';
import { MenuButton } from '../menu/MenuButton.tsx';
import { useTitleBar } from '../menu/useTitleBar.ts';
import { GoToSlideDialog } from '../menu/GoToSlideDialog.tsx';
import { darkUiTheme, uiTheme } from '../menu/uiTheme.ts';
import { UiThemeProvider } from '../menu/UiThemeProvider.tsx';
import { useDeckNavigation } from './useDeckNavigation.ts';
import {
  SlideStateContext,
  TransientSlideStateContext,
} from '../state/SlideStateContext.ts';
import { DeckStateContext } from '../state/DeckStateContext.ts';
import {
  DeckStateUsageContext,
  SlideStateUsageContext,
} from '../state/StateUsageContext.ts';
import { DeckStateStore } from '../state/DeckStateStore.ts';
import { SlideStateStore } from '../state/SlideStateStore.ts';
import { SharedWorkProvider } from '../shared/SharedWorkProvider.tsx';
import { StepStoreContext } from '../steps/StepStoreContext.ts';
import { resolveToc, type TocEntry } from './tableOfContents.ts';
import type { UiLocale } from '../i18n/messages.ts';
import { UiLanguageContext } from '../i18n/UiLanguageContext.ts';
import { useUiLanguageState } from '../i18n/useUiLanguageState.ts';
import { Sidebar, type SidebarSection } from '../sidebar/Sidebar.tsx';
import { StepTree } from '../sidebar/StepTree.tsx';
import { useSlideProbe } from '../view/SlideProbe.tsx';
import { TocList } from '../sidebar/TocList.tsx';
import { SlideOverview } from '../overview/SlideOverview.tsx';
import { ThumbnailCache } from '../overview/ThumbnailCache.ts';
import { PresentedSlides } from '../overview/PresentedSlides.tsx';
import { ThumbnailRenderer } from '../overview/ThumbnailRenderer.tsx';
import { getSlideNotes } from '../notes/Notes.tsx';
import { NotesDisplay } from '../notes/NotesDisplay.tsx';
import {
  PointerMirroringContext,
  SLIDE_VIEW_ATTRIBUTE,
  type SlideView,
} from '../view/SlideViewContext.ts';

export interface DeckProps {
  /**
   * The slides of the deck, usually {@link Slide} elements.
   *
   * The `id` prop of a slide is used as the location hash when it is shown.
   */
  children?: ReactNode;
  /**
   * Options of plugins by their name, which components read with
   * {@link useSeminarOptions}. Decks written in MDX get the `options` of their
   * configs and frontmatter.
   */
  options?: SeminarOptions | undefined;
  /** MUI theme of the slides. Defaults to {@link defaultSlideTheme}. */
  theme?: Theme;
  /**
   * Whether clicking on the slides navigates initially (see
   * {@link useClickNavigation}). Defaults to `true`. The presenter can toggle
   * it in the context menu.
   *
   * With mouse navigation, text on the slides can't be selected, except in
   * text fields and elements with the `data-seminar-interactive` attribute,
   * since selecting text with the mouse would interfere with clicking.
   */
  defaultMouseNavigation?: boolean;
  /**
   * Whether the presenter view starts mirroring the mouse pointer of the
   * presenter to the audience. Defaults to `false`, since the pointer is
   * often over the slide in the presenter view without meaning to point at
   * anything. The presenter can toggle it in the toolbar.
   */
  defaultMirrorPointer?: boolean;
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
  /**
   * The language of the slides, as a BCP 47 tag, e.g., `hu`, which slides can
   * override with their own `lang`. Decks written in MDX take it from the
   * `lang` of their frontmatter.
   */
  lang?: string | undefined;
  /**
   * The languages that the user interface can be shown in, e.g., the
   * languages of the core, like {@link HUNGARIAN}. The viewer can switch between
   * them in the menu if there are several. Initially, the user interface is
   * shown in the language the viewer chose before, or the one their browser
   * prefers if there are several, or the language of the slides, or the
   * first one. Defaults to English.
   */
  uiLocales?: readonly UiLocale[] | undefined;
  /**
   * What the deck tells about itself, like its title and authors, e.g., for
   * the headers of its printed pages. Decks written in MDX take it from their
   * frontmatter.
   */
  metadata?: DeckMetadata | undefined;
}

const SELECTABLE_SELECTOR = [
  `[${INTERACTIVE_ATTRIBUTE}]`,
  `[${SELECTABLE_ATTRIBUTE}]`,
  'input',
  'textarea',
  '[contenteditable]',
]
  .map((selector) => `& ${selector}`)
  .join(', ');

/** Slides the slide in from `--seminar-enter-from` after a swipe. */
const enter = keyframes`
  from {
    translate: var(--seminar-enter-from) 0;
  }
`;

function getSlideLang(slide: ReactNode): string | undefined {
  if (isValidElement<{ lang?: unknown }>(slide)) {
    const { lang } = slide.props;
    if (typeof lang === 'string' && lang !== '') {
      return lang;
    }
  }
  return undefined;
}

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

const NO_OPTIONS: SeminarOptions = {};

/**
 * Id of the area of the slide, the main landmark of the deck, which the pages
 * of decks link to, so that it can be skipped to.
 */
const SLIDES_ID = 'seminar-slides';

/**
 * Shows one of its child slides at a time, scaled to fit the viewport.
 *
 * Going through the deck skips spare slides (see the `spare` prop of
 * {@link Slide}).
 *
 * Inside a {@link DeckDocument}, renders the slides as a document instead.
 */
export function Deck(props: DeckProps): JSX.Element {
  return use(DeckDocumentContext) ? (
    <DocumentDeck {...props} />
  ) : (
    <InteractiveDeck {...props} />
  );
}

function InteractiveDeck({
  children,
  options = NO_OPTIONS,
  theme = defaultSlideTheme,
  defaultMouseNavigation = true,
  defaultMirrorPointer = false,
  toc: tocEntries,
  defaultShowToc = false,
  defaultShowSteps = false,
  lang,
  uiLocales,
  metadata,
}: DeckProps): JSX.Element {
  const uiLanguage = useUiLanguageState(lang, uiLocales);
  const { t } = uiLanguage;
  const { slides, slideIds, aliases, recapOf } = useMemo(() => {
    // Slides are positional children, so we need to index into them.
    // eslint-disable-next-line @eslint-react/no-children-to-array
    const raw = Children.toArray(children);
    const rawAliases = getAliases(raw);
    const resolved = resolveRecaps(raw, raw.map(getSlideId), rawAliases);
    return {
      slides: resolved.slides,
      slideIds: resolved.slides.map(getSlideId),
      aliases: rawAliases,
      recapOf: resolved.recapOf,
    };
  }, [children]);
  const slideCount = slides.length;
  const thumbnails = useMemo(
    () => new ThumbnailCache(),
    // Content and rendering settings each start a fresh cache, including in HMR.
    // eslint-disable-next-line react-hooks/exhaustive-deps, @eslint-react/exhaustive-deps
    [slides, theme, options, lang],
  );
  const slideLangs = useMemo(
    () => slides.map((slide) => getSlideLang(slide) ?? lang),
    [slides, lang],
  );
  const spares = useSpares(slides.map(isSpare));
  const [slideState] = useState(() => new SlideStateStore());
  const [deckState] = useState(() => new DeckStateStore());
  useEffect(
    () => thumbnails.observe(deckState, slideState),
    [thumbnails, deckState, slideState],
  );
  const [transitions] = useState(() => new SlideTransitions());
  const stepFade = useCallback(
    (index: number) =>
      getStepFade(slides[index], theme.master) ??
      getFadeTransition(theme, 'step').duration,
    [theme, slides],
  );
  const slideFade = useCallback(
    (from: number, to: number) =>
      getFadeBetween(slides[from], slides[to], to > from, theme.master) ??
      getFadeTransition(theme, 'slide').duration,
    [theme, slides],
  );
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
  } = useDeckNavigation(slideIds, aliases, spares, slideState, {
    transitions,
    stepFade,
    slideFade,
  });
  const transientState = useMemo(
    () => new SlideStateStore(),
    // Each visit starts fresh; retained frames keep the previous store.
    // eslint-disable-next-line react-hooks/exhaustive-deps, @eslint-react/exhaustive-deps
    [slideIndex],
  );
  const { probed, probe } = useSlideProbe(slides);
  useEffect(() => {
    for (const [index, slide] of probed.entries()) {
      if (thumbnails.getBackground(index) === undefined)
        thumbnails.setBackground(index, slide.backgroundColor);
    }
  }, [probed, thumbnails]);
  // The current slide knows its steps even before it is probed, or after its
  // components gain steps, but not while it isn't shown, e.g., in the
  // overview.
  const currentHasSteps = useSyncExternalStore(
    stepStore.subscribe,
    () => stepStore.getTree().length > 0,
  );
  const hasSteps = useMemo(
    () =>
      slides.map(
        (_, index) =>
          probed[index]?.steps === true ||
          (index === slideIndex && currentHasSteps),
      ),
    [slides, slideIndex, currentHasSteps, probed],
  );
  // Recaps share the state of the slide they recap, even in the probe.
  const changedStates = useSyncExternalStore(
    slideState.subscribeChanged,
    slideState.getChanged,
  );
  const stateChanged = useMemo(
    () => slides.map((_, index) => changedStates.has(recapOf[index] ?? index)),
    [slides, recapOf, changedStates],
  );
  const hasState = useMemo(
    () =>
      slides.map(
        (_, index) =>
          probed[recapOf[index] ?? index]?.state === true ||
          stateChanged[index] === true,
      ),
    [slides, recapOf, probed, stateChanged],
  );
  const resetSlide = useCallback(
    (index: number) => {
      slideState.reset(recapOf[index] ?? index);
      goTo(index);
    },
    [slideState, recapOf, goTo],
  );
  const deckStateChanged = useSyncExternalStore(
    deckState.subscribeChanged,
    deckState.getChanged,
  );
  const deckChanged = deckStateChanged || changedStates.size > 0;
  const toc = useMemo(
    () =>
      resolveToc(tocEntries ?? [], slides, slideIds, {
        untitled: t('untitled'),
        slide: (index) => t('slide', { number: index + 1 }),
      }),
    [tocEntries, slides, slideIds, t],
  );
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
  const resetDeck = useCallback(() => {
    // Apply pending navigation before clearing the positions it may write.
    transitions.skip();
    deckState.reset();
    slideState.resetAll();
    transientState.resetAll();
    for (let index = 0; index < slideCount; index += 1)
      thumbnails.invalidate(index);
    setShowOverview(false);
    goTo(firstSlideIndex, 'start', { transition: false });
  }, [
    transitions,
    deckState,
    slideState,
    transientState,
    slideCount,
    thumbnails,
    setShowOverview,
    goTo,
    firstSlideIndex,
  ]);
  const presenterView = usePresenterView(t('presenterView'));
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
  const [pointerMode, setPointerMode] = useState<PointerMode>(
    defaultMirrorPointer ? 'mirror' : 'off',
  );
  // The mode to return to when the laser pointer is turned off.
  const [modeBeforeLaser, setModeBeforeLaser] = useState<PointerMode>(
    defaultMirrorPointer ? 'mirror' : 'off',
  );
  const pointerHandlers = usePointerTracking(pointer, pointerMode, transitions);
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
    transitions,
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
            title: t('contents'),
            expanded: showToc,
            onToggle: () => {
              setShowToc(!showToc);
            },
            children: <TocList />,
          },
        ]),
    {
      key: 'steps',
      title: t('steps'),
      expanded: showSteps,
      onToggle: () => {
        setShowSteps(!showSteps);
      },
      children: <StepTree store={stepStore} />,
    },
  ];
  const showSidebar = sidebarSections.some(({ expanded }) => expanded);
  const titleBar = useTitleBar();
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
  const [slideAreaRef, , containerSize, areaFit] = useFitScale(
    SLIDE_WIDTH,
    SLIDE_HEIGHT,
  );
  const slideFit = areaFit.slide;
  // Fade the slide when it changes, unless the overview shows it instead.
  // The area of the slide stays when the slide changes, unlike the frame of
  // the slide, which is part of the slides that move together while swiping.
  const [slideArea, setSlideArea] = useState<HTMLElement | null>(null);
  useEffect(
    () =>
      slideArea === null || showOverview
        ? undefined
        : transitions.register(slideArea),
    [slideArea, showOverview, transitions],
  );
  // The presenter panel keeps showing the notes and previews of the step
  // before until the slide shows the change, too.
  const [presenterPanel, setPresenterPanel] = useState<HTMLElement | null>(
    null,
  );
  useEffect(
    () =>
      presenterPanel === null || showOverview
        ? undefined
        : transitions.register(presenterPanel, { holdOnly: true }),
    [presenterPanel, showOverview, transitions],
  );
  const notes = getSlideNotes(slides[slideIndex]);
  // The notes are in the language of their slide.
  const notesLang = getSlideLang(slides[slideIndex]) ?? lang;
  const [mouseNavigation, setMouseNavigation] = useState(
    defaultMouseNavigation,
  );
  const [menuPosition, menuHandlers, openMenu, closeMenu] = useContextMenu();

  const deck = useMemo<DeckState>(
    () => ({
      lang,
      slideLangs,
      slideIndex,
      slideCount,
      atFirstStep,
      atLastStep,
      nextSlideIndex,
      previousSlideIndex,
      firstSlideIndex,
      lastSlideIndex,
      spares,
      recapOf,
      hasSteps,
      hasState,
      stateChanged,
      resetSlide,
      deckChanged,
      resetDeck,
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
      lang,
      slideLangs,
      slideIndex,
      slideCount,
      atFirstStep,
      atLastStep,
      nextSlideIndex,
      previousSlideIndex,
      firstSlideIndex,
      lastSlideIndex,
      spares,
      recapOf,
      hasSteps,
      hasState,
      stateChanged,
      resetSlide,
      deckChanged,
      resetDeck,
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
  const [printOpen, setPrintOpen] = useState(false);
  // An application that shows the deck may print it right away.
  const [host] = useState(getSeminarHost);
  // The options of the pages being prepared for printing, if any.
  const [printing, setPrinting] = useState<PrintOptions | undefined>(
    host?.print,
  );
  const openPrint = useCallback(() => {
    setPrintOpen(true);
  }, []);
  // Whether the pages are ready, and only wait for our dialog to close.
  const [printReady, setPrintReady] = useState(false);
  const closePrint = useCallback(() => {
    setPrintOpen(false);
    setPrinting(undefined);
    setPrintReady(false);
  }, []);
  const onPrintReady = useCallback(
    (printed: PrintedDocument) => {
      if (host?.printReady !== undefined) {
        host.printReady(printed);
        return;
      }
      setPrintOpen(false);
      setPrintReady(true);
    },
    [host],
  );
  // The print dialog of the browser blocks the page, which it keeps showing
  // behind it, including animations, so print once our dialog is closed.
  useEffect(() => {
    if (!printReady) {
      return undefined;
    }
    let timeout: ReturnType<typeof setTimeout> | undefined;
    // After the next frame is painted.
    const frame = requestAnimationFrame(() => {
      timeout = setTimeout(() => {
        // Blocks until the print dialog of the browser is closed.
        window.print();
        closePrint();
      }, 0);
    });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timeout);
    };
  }, [printReady, closePrint]);
  const presentation = usePresentation(presenterView);
  // An application that shows the deck may start the presentation right away,
  // but only once, even if effects run twice, as in strict mode, where a
  // second start would stop the presentation, or fail to enter full screen
  // again.
  const startPresentation = useEffectEvent(presentation.toggle);
  const startedRef = useRef(false);
  useEffect(() => {
    if (host?.present === true && !startedRef.current) {
      startedRef.current = true;
      if (host.activate === undefined) {
        startPresentation();
      } else {
        host.activate().then(startPresentation, (error: unknown) => {
          console.warn('Could not start the presentation:', error);
        });
      }
    }
  }, [host]);
  // Tell the preview apart from the presentation in the title of its window.
  const previewLabel = t('preview');
  useEffect(() => {
    if (host?.preview !== true) {
      return undefined;
    }
    const title = document.title;
    document.title = `${title} (${previewLabel})`;
    return () => {
      document.title = title;
    };
  }, [host, previewLabel]);
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
    onPrint: openPrint,
  });
  const onClick = useClickNavigation(
    next,
    previous,
    transitions,
    presenterFrame,
  );
  const onWheel = useWheelNavigation(next, previous, transitions);
  const swipe = useSwipeNavigation({
    hasMoreSteps: () => stepStore.hasNext(),
    canGoNext: nextSlideIndex !== undefined,
    canGoPrevious: previousSlideIndex !== undefined,
    // Swiping moves the slides instead of fading them.
    nextSlide: () => {
      nextSlide({ transition: false });
    },
    previousSlide: () => {
      previousSlide({ transition: false });
    },
    spacing: areaFit.spacing,
    slideWidth: SLIDE_WIDTH * slideFit.scale,
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

  const toolbarProps = {
    timerStart,
    onResetTimer: resetTimer,
    onGoToSlide: openGoToSlide,
    notesOnly,
    setNotesOnly,
    pointerMode,
    onMirrorPointer: toggleMirrorPointer,
    onLaserPointer: toggleLaserPointer,
    menuOpen: menuPosition !== undefined,
    onOpenMenu: openMenu,
  };
  // Below the title bar, which then separates them from the window controls,
  // instead of the title bar covering the letterbox above the slides.
  const belowTitleBar = presenting || showSidebar;
  // Like the presenter view, the sidebar, and the overview, or the letterbox
  // around the slides.
  const titleBarColor =
    belowTitleBar || showOverview
      ? darkUiTheme.palette.background.default
      : 'common.black';
  const titleBarElement = titleBar !== undefined && (
    <UiThemeProvider dark>
      {presenting ? (
        <PresenterToolbar
          {...toolbarProps}
          // Unlike the presenter view, doesn't change with the sidebar, so it
          // doesn't have to be measured again.
          width={titleBar.width}
          titleBar={{ area: titleBar, color: titleBarColor }}
        />
      ) : (
        <DeckTitleBar
          area={titleBar}
          color={titleBarColor}
          // Like in the presenter view.
          divider={belowTitleBar || showOverview}
          onGoToSlide={openGoToSlide}
          onPresent={presentation.toggle}
          menuOpen={menuPosition !== undefined}
          onOpenMenu={openMenu}
        />
      )}
    </UiThemeProvider>
  );
  const letterbox =
    titleBar !== undefined && !belowTitleBar
      ? titleBarMargins(presenterAreaSize, titleBar.height)
      : undefined;

  const content = (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {/*
       * Like the letterbox around the slides, instead of the background of
       * the slides, which would show while the window is resized.
       */}
      <GlobalStyles
        styles={{ '@media screen': { 'html, body': { background: '#000' } } }}
      />
      <SlideTransitionStyles />
      <UiLanguageContext value={uiLanguage}>
        <DeckContext value={deck}>
          <SeminarOptionsContext value={options}>
            <SlideTransitionsContext value={transitions}>
              <DeckStateContext value={deckState}>
                <SlideStateContext value={slideState}>
                  <StepStoreContext value={stepStore}>
                    <Box
                      sx={{
                        position: 'fixed',
                        inset: 0,
                        display: 'flex',
                        flexDirection: 'column',
                      }}
                    >
                      {titleBarElement !== false && (
                        // Always in the same place, so that it isn't remounted
                        // when the sidebar is toggled.
                        <Box
                          sx={[
                            { flex: 'none' },
                            !belowTitleBar && {
                              // Above the slides and the overview.
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              right: 0,
                              zIndex: 1,
                            },
                          ]}
                        >
                          {titleBarElement}
                        </Box>
                      )}
                      <Box
                        sx={{
                          flex: 1,
                          minHeight: 0,
                          display: 'flex',
                          // Below the title bar, whatever the order of the
                          // slides within.
                          isolation: 'isolate',
                        }}
                      >
                        {showSidebar && (
                          // Outside of the slides, so that clicks don't navigate. Dark
                          // like the letterbox around the slides, the overview, and the
                          // presenter view.
                          <UiThemeProvider dark>
                            <Sidebar sections={sidebarSections} />
                          </UiThemeProvider>
                        )}
                        {/*
                         * Always rendered, so that the slide isn't remounted when the
                         * presenter view opens or closes.
                         */}
                        <Box
                          sx={{
                            position: 'relative',
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
                              // Around the slide, with its letterbox.
                              bgcolor: 'common.black',
                            }}
                          >
                            <Box
                              ref={slideAreaRef}
                              component="main"
                              id={SLIDES_ID}
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
                                letterbox !== undefined && {
                                  mt: `${String(letterbox.top)}px`,
                                  mb: `${String(letterbox.bottom)}px`,
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
                              {/* On whole device pixels, see fitArea. */}
                              <Box
                                ref={setSlideArea}
                                style={pixelBoxStyles(areaFit.area)}
                              >
                                {/* Moves the slides together while swiping. */}
                                <Box
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
                                          '--seminar-enter-from': `${String(swipe.enterFrom)}px`,
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
                                        index === undefined
                                          ? []
                                          : [[index, side] as const],
                                      )
                                      .map(([index, side]) => (
                                        <Box
                                          key={index}
                                          inert
                                          sx={[
                                            {
                                              position: 'absolute',
                                              top: 0,
                                              bottom: 0,
                                              width: '100%',
                                            },
                                            swipe.transition === 'settle' && {
                                              transition: `translate ${String(SETTLE_DURATION)}ms ease-out`,
                                            },
                                          ]}
                                          style={{
                                            left: side * areaFit.spacing,
                                            // Stays behind while the slide resists.
                                            ...(side === 1
                                              ? {
                                                  translate: `${String(swipe.nextLag)}px 0`,
                                                }
                                              : {}),
                                          }}
                                        >
                                          <div style={pixelBoxStyles(slideFit)}>
                                            <Box
                                              sx={FITTED_SLIDE_FRAME_STYLES}
                                              style={{
                                                ...slideScaleStyles(
                                                  slideFit.scale,
                                                ),
                                              }}
                                              {...{
                                                [SLIDE_VIEW_ATTRIBUTE]:
                                                  'preview',
                                              }}
                                            >
                                              <SlideMirror
                                                index={index}
                                                slide={slides[index]}
                                                kind="preview"
                                              />
                                            </Box>
                                          </div>
                                        </Box>
                                      ))}
                                  <div style={pixelBoxStyles(slideFit)}>
                                    <PresentedSlides
                                      view={view}
                                      slide={slides[slideIndex]}
                                      cache={thumbnails}
                                      overview={showOverview}
                                      onFrame={setPresenterFrame}
                                      frameProps={{
                                        sx: FITTED_SLIDE_FRAME_STYLES,
                                        style: {
                                          ...slideScaleStyles(slideFit.scale),
                                          ...(presenting &&
                                          pointerMode === 'laser'
                                            ? { cursor: 'none' }
                                            : {}),
                                        },
                                        ...(presenting ? pointerHandlers : {}),
                                      }}
                                    />
                                  </div>
                                </Box>
                                {/* Doesn't move with the slides. */}
                                <ThemeProvider theme={uiTheme}>
                                  <SwipeHint open={swipe.showHint} />
                                </ThemeProvider>
                                {/* The presenter view shows the notes in its panel instead. */}
                                {notes !== undefined &&
                                  !showOverview &&
                                  !presenting && (
                                    <NotesDisplay
                                      // Collapse the notes on another slide.
                                      key={`notes-${String(slideIndex)}`}
                                      notes={notes}
                                      notesLang={notesLang}
                                      size={containerSize}
                                      scale={slideFit.scale}
                                    />
                                  )}
                              </Box>
                              {presenting && pointerMode === 'laser' && (
                                // The presenter sees the laser pointer, too, outside of
                                // the scope of the transitions, like in the audience
                                // window.
                                <div
                                  style={{
                                    ...pixelBoxStyles(areaFit.area),
                                    pointerEvents: 'none',
                                  }}
                                >
                                  <div style={pixelBoxStyles(slideFit)}>
                                    <Box
                                      sx={FITTED_SLIDE_FRAME_STYLES}
                                      style={{
                                        ...slideScaleStyles(slideFit.scale),
                                        backgroundColor: 'transparent',
                                      }}
                                    >
                                      <MirroredPointer
                                        store={pointer}
                                        mode="laser"
                                      />
                                    </Box>
                                  </div>
                                </div>
                              )}
                            </Box>
                            {presenting && (
                              <UiThemeProvider dark>
                                <Box
                                  ref={setPresenterPanel}
                                  // Clicking the panel navigates, too, so that the
                                  // presenter can advance without the mouse pointer
                                  // showing on the slide. Only the toolbar has controls.
                                  onClick={
                                    mouseNavigation ? onClick : undefined
                                  }
                                  onWheel={
                                    mouseNavigation ? onWheel : undefined
                                  }
                                  {...menuHandlers}
                                  sx={[
                                    {
                                      display: 'flex',
                                      minWidth: 0,
                                      minHeight: 0,
                                    },
                                    stacked
                                      ? { flex: 1 }
                                      : {
                                          flex: 'none',
                                          width: SIDE_PANEL_WIDTH,
                                        },
                                    mouseNavigation && {
                                      userSelect: 'none',
                                      [SELECTABLE_SELECTOR]: {
                                        userSelect: 'text',
                                      },
                                    },
                                  ]}
                                >
                                  <PresenterPanel
                                    slides={slides}
                                    notes={notes}
                                    notesLang={notesLang}
                                    slideTheme={theme}
                                    layout={presenterLayout}
                                    notesOnly={notesOnly}
                                  />
                                </Box>
                              </UiThemeProvider>
                            )}
                          </Box>
                          {presenting && titleBar === undefined && (
                            <UiThemeProvider dark>
                              <PresenterToolbar
                                {...toolbarProps}
                                width={presenterAreaSize.width}
                              />
                            </UiThemeProvider>
                          )}
                        </Box>
                      </Box>
                    </Box>
                    {probe}
                    <ThumbnailRenderer
                      cache={thumbnails}
                      slides={slides}
                      shownIndex={showOverview ? undefined : slideIndex}
                      priorityIndex={showOverview ? overviewIndex : slideIndex}
                      paused={swipe.moving || printing !== undefined}
                    />
                    {printing !== undefined && (
                      <PrintView
                        slides={slides}
                        spares={spares}
                        options={printing}
                        metadata={metadata}
                        onReady={onPrintReady}
                      />
                    )}
                    {showOverview && (
                      <SlideOverview
                        slides={slides}
                        cache={thumbnails}
                        onClose={() => {
                          setShowOverview(false);
                        }}
                        menuHandlers={menuHandlers}
                        top={titleBar?.height}
                      />
                    )}
                    {/* Outside of the slides, so that events don't bubble to them. */}
                    <ThemeProvider theme={uiTheme}>
                      {/* The presenter view has a menu button in its toolbar. */}
                      {!presenting && titleBar === undefined && (
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
                        onPrint={openPrint}
                      />
                      <GoToSlideDialog
                        open={goToSlideOpen}
                        onClose={closeGoToSlide}
                      />
                      <PrintDialog
                        open={printOpen}
                        preparing={printing !== undefined}
                        onPrint={setPrinting}
                        onClose={closePrint}
                      />
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
              </DeckStateContext>
            </SlideTransitionsContext>
          </SeminarOptionsContext>
        </DeckContext>
      </UiLanguageContext>
    </ThemeProvider>
  );
  return (
    <DeckStateUsageContext value={thumbnails.recordDeckStateUse}>
      <SlideStateUsageContext value={thumbnails.recordSlideStateUse}>
        <SharedWorkProvider>
          <TransientSlideStateContext value={transientState}>
            <PointerMirroringContext
              value={presenting && pointerMode === 'mirror'}
            >
              {content}
            </PointerMirroringContext>
          </TransientSlideStateContext>
        </SharedWorkProvider>
      </SlideStateUsageContext>
    </DeckStateUsageContext>
  );
}
