import { Box, GlobalStyles } from '@mui/material';
import {
  Component,
  Suspense,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type JSX,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import { compareStepPaths } from '../steps/stepRange.ts';
import { StepStore, type StepPath } from '../steps/StepStore.ts';
import { StepStoreContext } from '../steps/StepStoreContext.ts';
import { SLIDE_HEIGHT, SLIDE_WIDTH } from '../theme/createSlideTheme.ts';
import { useTransitionHold } from '../transitions/settling.ts';
import { SlideTransitionsContext } from '../transitions/SlideTransitions.ts';
import {
  SLIDE_VIEW_ATTRIBUTE,
  type SlideView,
} from '../view/SlideViewContext.ts';
import { SlideViewProvider } from '../view/SlideViewProvider.tsx';
import { PrintTransitions } from './PrintTransitions.ts';

/** How slides are printed. */
export interface PrintOptions {
  /**
   * Which steps of the slides to make pages of: `'split'` for as few as
   * needed to show everything (see `StepStore.getSplitPaths`), or `'steps'`
   * for every step.
   */
  pages: 'split' | 'steps';
  /** Whether to print spare slides, too. */
  spares: boolean;
}

/** Id of the element with the pages, the only one shown when printing. */
export const PRINT_ID = 'seminar-print';

/** Data attribute of pages with the number of their slide. */
export const PAGE_ATTRIBUTE = 'data-seminar-page';

const PRINT_STYLES = `
@page {
  size: ${String(SLIDE_WIDTH)}px ${String(SLIDE_HEIGHT)}px;
  margin: 0;
}

@media print {
  html, body {
    margin: 0;
    padding: 0;
    height: auto;
    overflow: visible;
    background: none;
  }

  body > :not(#${PRINT_ID}) {
    display: none !important;
  }

  #${PRINT_ID} {
    position: static !important;
  }
}
`;

/** How often to check whether the pages are ready, in milliseconds. */
const CHECK_INTERVAL = 50;

/** Number of checks in a row that find nothing changing before printing. */
const QUIET_CHECKS = 3;

/** How long to wait for the pages at most, in milliseconds. */
const MAX_WAIT = 10_000;

/**
 * Waits until the pages in `root` stop changing, nothing holds them, e.g., a
 * diagram that is still being rendered, and their fonts and images are
 * loaded, or until {@link MAX_WAIT} passes.
 */
async function waitUntilReady(
  root: HTMLElement,
  transitions: PrintTransitions,
  signal: AbortSignal,
): Promise<void> {
  const start = performance.now();
  let pages = -1;
  let quiet = 0;
  while (quiet < QUIET_CHECKS && performance.now() - start < MAX_WAIT) {
    await new Promise((resolve) => {
      setTimeout(resolve, CHECK_INTERVAL);
    });
    signal.throwIfAborted();
    const images = [...root.querySelectorAll('img')];
    for (const image of images) {
      // Pages are outside of the viewport until they are printed.
      image.loading = 'eager';
    }
    await Promise.allSettled([
      ...('fonts' in document ? [document.fonts.ready] : []),
      ...images.map((image) =>
        'decode' in image ? image.decode() : undefined,
      ),
    ]);
    signal.throwIfAborted();
    const count = root.querySelectorAll(`[${PAGE_ATTRIBUTE}]`).length;
    quiet = transitions.isHeld() || count !== pages ? 0 : quiet + 1;
    pages = count;
  }
}

/** Holds the pages while a slide is suspended. */
function Pending(): null {
  useTransitionHold(true);
  return null;
}

/** Leaves out a slide that fails to render. */
class PrintBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

interface PageProps {
  index: number;
  slide: ReactNode;
  store: StepStore;
}

/** A page with the slide at the step of `store`. */
function Page({ index, slide, store }: PageProps): JSX.Element {
  const view = useMemo<SlideView>(
    () => ({ index, kind: 'print', interactive: false }),
    [index],
  );
  return (
    <Box
      {...{
        [SLIDE_VIEW_ATTRIBUTE]: 'print',
        [PAGE_ATTRIBUTE]: String(index + 1),
      }}
      sx={{
        position: 'relative',
        width: SLIDE_WIDTH,
        height: SLIDE_HEIGHT,
        overflow: 'hidden',
        bgcolor: 'background.default',
        color: 'text.primary',
        breakBefore: 'page',
        '&:first-of-type': { breakBefore: 'auto' },
        printColorAdjust: 'exact',
        WebkitPrintColorAdjust: 'exact',
      }}
    >
      <StepStoreContext value={store}>
        <SlideViewProvider view={view}>
          <Suspense fallback={<Pending />}>{slide}</Suspense>
        </SlideViewProvider>
      </StepStoreContext>
    </Box>
  );
}

/** A page with the slide at `path`. */
function PageAt({
  index,
  slide,
  path,
}: {
  index: number;
  slide: ReactNode;
  path: StepPath;
}): JSX.Element {
  const [store] = useState(() => new StepStore({ target: path }));
  return <Page index={index} slide={slide} store={store} />;
}

/**
 * The pages of a slide. The last step of the slide is a page in any case,
 * whose steps tell which other steps to make pages of, before it.
 */
function SlidePages({
  index,
  slide,
  pages,
}: {
  index: number;
  slide: ReactNode;
  pages: PrintOptions['pages'];
}): JSX.Element {
  const [store] = useState(() => new StepStore({ toEnd: true }));
  const paths = useSyncExternalStore(
    store.subscribe,
    pages === 'split' ? store.getSplitPaths : store.getStates,
  );
  const last = useSyncExternalStore(store.subscribe, store.getPath);
  return (
    <>
      {paths
        .filter((path) => compareStepPaths(path, last) < 0)
        .map((path) => (
          <PageAt
            key={path.join('.')}
            index={index}
            slide={slide}
            path={path}
          />
        ))}
      <Page index={index} slide={slide} store={store} />
    </>
  );
}

export interface PrintViewProps {
  slides: readonly ReactNode[];
  /** Whether each slide is spare. */
  spares: readonly boolean[];
  options: PrintOptions;
  /** Called once the pages are ready to be printed. */
  onReady: () => void;
}

/**
 * Renders the slides as pages for printing outside of the
 * viewport, and replaces the rest of the document with them when printing.
 * Each page is as large as a slide.
 */
export function PrintView({
  slides,
  spares,
  options,
  onReady,
}: PrintViewProps): JSX.Element {
  const [transitions] = useState(() => new PrintTransitions());
  const ref = useRef<HTMLDivElement>(null);
  const ready = useEffectEvent(onReady);
  useEffect(() => {
    const root = ref.current;
    if (root === null) {
      return undefined;
    }
    const controller = new AbortController();
    waitUntilReady(root, transitions, controller.signal).then(
      () => {
        ready();
      },
      () => undefined,
    );
    return () => {
      controller.abort();
    };
  }, [transitions]);
  return createPortal(
    <SlideTransitionsContext value={transitions}>
      <GlobalStyles styles={PRINT_STYLES} />
      <Box
        ref={ref}
        id={PRINT_ID}
        inert
        aria-hidden
        sx={{ position: 'fixed', left: -100000, top: 0 }}
      >
        {slides.map((slide, index) =>
          options.spares || spares[index] !== true ? (
            // Slides are positional, see `Deck`.
            // eslint-disable-next-line @eslint-react/no-array-index-key
            <PrintBoundary key={index}>
              <SlidePages index={index} slide={slide} pages={options.pages} />
            </PrintBoundary>
          ) : null,
        )}
      </Box>
    </SlideTransitionsContext>,
    document.body,
  );
}
