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

import { SlideViewProvider } from '../slide/SlideViewProvider.tsx';
import { SlideStateContext } from '../state/SlideStateContext.ts';
import { SlideStateStore } from '../state/SlideStateStore.ts';
import { StepStore } from './StepStore.ts';
import { StepStoreContext } from './StepStoreContext.ts';

const NO_SLIDES: readonly boolean[] = [];

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

interface StepProbeProps {
  slides: readonly ReactNode[];
  onProbe: (hasSteps: boolean[]) => void;
}

/**
 * Renders `slides` in probe views (see `SlideViewKind`) in a document without
 * a window, and reports which of them have steps once they are rendered.
 */
function StepProbe({ slides, onProbe }: StepProbeProps): JSX.Element {
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
    onProbe(probes.map(({ store }) => store.getTree().length > 0));
  }, [probes, onProbe]);
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

export interface StepProbeResult {
  /**
   * Whether each slide has steps, by index. Empty until the slides are probed,
   * and the previous result while changed slides are probed.
   */
  hasSteps: readonly boolean[];
  /** Renders the probe while it runs. */
  probe: ReactNode;
}

/**
 * Finds which of `slides` have steps without showing them, by rendering them
 * once, when the browser is idle, in probe views (see `SlideViewKind`).
 */
export function useStepProbe(slides: readonly ReactNode[]): StepProbeResult {
  const [result, setResult] = useState<{
    slides: readonly ReactNode[];
    hasSteps: readonly boolean[];
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
    () => (hasSteps: boolean[]) => {
      setResult({ slides, hasSteps });
    },
    [slides],
  );
  return {
    hasSteps: result?.hasSteps ?? NO_SLIDES,
    probe:
      due === slides && !probed ? (
        <StepProbe slides={slides} onProbe={onProbe} />
      ) : null,
  };
}
