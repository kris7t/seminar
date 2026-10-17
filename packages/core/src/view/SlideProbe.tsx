import {
  Component,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type JSX,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import { SlideStateContext } from '../state/SlideStateContext.ts';
import { SlideStateStore } from '../state/SlideStateStore.ts';
import { StepStore } from '../steps/StepStore.ts';
import { StepStoreContext } from '../steps/StepStoreContext.ts';
import { SlideViewProvider } from './SlideViewProvider.tsx';

/** What probing a slide found. */
export interface ProbedSlide {
  /** Whether the slide has steps. */
  steps: boolean;
  /**
   * Whether the slide has state that it keeps when it is left, e.g., from
   * `useSlideState`.
   */
  state: boolean;
}

const NO_SLIDES: readonly ProbedSlide[] = [];

/** Leaves out a slide that fails to render in the probe. */
class ProbeBoundary extends Component<
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

interface SlideProbeProps {
  slides: readonly ReactNode[];
  onProbe: (probed: ProbedSlide[]) => void;
}

/**
 * Renders `slides` in probe views (see `SlideViewKind`) in a document without
 * a window, and reports what they have once they are rendered.
 */
function SlideProbe({ slides, onProbe }: SlideProbeProps): JSX.Element {
  // Elements of a document without a window don't load anything.
  const [container] = useState(
    () => document.implementation.createHTMLDocument('').body,
  );
  // State of its own, so that the probe doesn't set up the state of the slides.
  const [slideState] = useState(() => new SlideStateStore());
  const probes = useMemo(
    () => slides.map((slide) => ({ slide, store: new StepStore() })),
    [slides],
  );
  // Steps attach as they are committed, before the effects of their parents.
  useLayoutEffect(() => {
    onProbe(
      probes.map(({ store }, index) => ({
        steps: store.getTree().length > 0,
        state: slideState.hasState(index),
      })),
    );
  }, [probes, slideState, onProbe]);
  return createPortal(
    <SlideStateContext value={slideState}>
      {probes.map(({ slide, store }, index) => (
        // Slides are positional, see `Deck`.
        // eslint-disable-next-line @eslint-react/no-array-index-key
        <ProbeBoundary key={index}>
          <Suspense fallback={null}>
            <StepStoreContext value={store}>
              <SlideViewProvider
                view={{ index, kind: 'probe', interactive: false }}
              >
                {slide}
              </SlideViewProvider>
            </StepStoreContext>
          </Suspense>
        </ProbeBoundary>
      ))}
    </SlideStateContext>,
    container,
  );
}

/** Calls `callback` when the browser is idle, and returns a canceler. */
function whenIdle(callback: () => void): () => void {
  if (typeof requestIdleCallback === 'function') {
    const handle = requestIdleCallback(callback, { timeout: 1000 });
    return () => {
      cancelIdleCallback(handle);
    };
  }
  const handle = setTimeout(callback, 0);
  return () => {
    clearTimeout(handle);
  };
}

export interface SlideProbeResult {
  /**
   * What each slide has, by index. Empty until the slides are probed, and the
   * previous result while changed slides are probed.
   */
  probed: readonly ProbedSlide[];
  /** Renders the probe while it runs. */
  probe: ReactNode;
}

/**
 * Finds what `slides` have, like steps, without showing them, by rendering
 * them once, when the browser is idle, in probe views (see `SlideViewKind`).
 */
export function useSlideProbe(slides: readonly ReactNode[]): SlideProbeResult {
  const [result, setResult] = useState<{
    slides: readonly ReactNode[];
    probed: readonly ProbedSlide[];
  }>();
  const [due, setDue] = useState<readonly ReactNode[]>();
  const probed = result?.slides === slides;
  useEffect(() => {
    if (probed) {
      return undefined;
    }
    return whenIdle(() => {
      setDue(slides);
    });
  }, [slides, probed]);
  const onProbe = useMemo(
    () => (probed: ProbedSlide[]) => {
      setResult({ slides, probed });
    },
    [slides],
  );
  return {
    probed: result?.probed ?? NO_SLIDES,
    probe:
      due === slides && !probed ? (
        <SlideProbe slides={slides} onProbe={onProbe} />
      ) : null,
  };
}
