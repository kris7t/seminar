import { Box } from '@mui/material';
import {
  use,
  useCallback,
  useMemo,
  useState,
  type JSX,
  type ReactNode,
} from 'react';

import { DeckContext, useDeck, type DeckState } from '../deck/DeckContext.ts';
import { StepStoreContext } from '../steps/StepStoreContext.ts';
import type { StepStore } from '../steps/StepStore.ts';
import { TransientSlideStateContext } from '../state/SlideStateContext.ts';
import type { SlideStateStore } from '../state/SlideStateStore.ts';
import {
  SelectionFrame,
  type SelectionFrameProps,
} from '../view/SelectionFrame.tsx';
import {
  SLIDE_VIEW_ATTRIBUTE,
  type SlideView,
} from '../view/SlideViewContext.ts';
import { SlideViewProvider } from '../view/SlideViewProvider.tsx';
import { ThumbnailCapture } from './ThumbnailCapture.tsx';
import type { ThumbnailCache } from './ThumbnailCache.ts';

interface Layer {
  key: number;
  view: SlideView;
  slide: ReactNode;
  steps: StepStore;
  deck: DeckState;
  cache: ThumbnailCache;
  transientState: SlideStateStore | undefined;
}

interface PresentedSlidesProps {
  view: SlideView;
  slide: ReactNode;
  cache: ThumbnailCache;
  overview: boolean;
  frameProps: SelectionFrameProps;
  onFrame: (frame: HTMLElement | null) => void;
}

function PresentedLayer({
  layer,
  current,
  active,
  frameProps,
  onFrame,
  onCaptured,
}: {
  layer: Layer;
  current: boolean;
  active: boolean;
  frameProps: SelectionFrameProps;
  onFrame: PresentedSlidesProps['onFrame'];
  onCaptured: (key: number) => void;
}): JSX.Element {
  const [frame, setFrame] = useState<HTMLDivElement | null>(null);
  const view = useMemo(
    () => ({ ...layer.view, interactive: active }),
    [layer.view, active],
  );
  const ref = useCallback(
    (element: HTMLDivElement | null) => {
      setFrame(element);
      if (current) onFrame(element);
    },
    [current, onFrame],
  );
  const done = useCallback(() => {
    if (!current) onCaptured(layer.key);
  }, [current, layer.key, onCaptured]);
  return (
    <SelectionFrame
      {...frameProps}
      ref={ref}
      {...{ [SLIDE_VIEW_ATTRIBUTE]: layer.view.kind }}
      data-seminar-retained={current ? undefined : ''}
      inert={!active}
      aria-hidden={active ? undefined : true}
      style={{
        ...frameProps.style,
        zIndex: current ? 1 : 0,
        pointerEvents: active ? undefined : 'none',
      }}
    >
      <DeckContext value={layer.deck}>
        <StepStoreContext value={layer.steps}>
          <ThumbnailCapture
            cache={layer.cache}
            index={layer.view.index}
            stateIndex={
              layer.deck.recapOf[layer.view.index] ?? layer.view.index
            }
            kind={layer.view.kind}
            frame={frame}
            active={active}
            onCaptured={done}
          />
          <TransientSlideStateContext value={layer.transientState}>
            <SlideViewProvider view={view}>{layer.slide}</SlideViewProvider>
          </TransientSlideStateContext>
        </StepStoreContext>
      </DeckContext>
    </SelectionFrame>
  );
}

/** Keeps one departed slide behind the current slide until its capture finishes. */
export function PresentedSlides({
  view,
  slide,
  cache,
  overview,
  frameProps,
  onFrame,
}: PresentedSlidesProps): JSX.Element {
  const steps = use(StepStoreContext);
  const deck = useDeck();
  const transientState = use(TransientSlideStateContext);
  const [state, setState] = useState<{
    current: Layer;
    retired?: Layer | undefined;
    nextKey: number;
  }>(() => ({
    current: { key: 0, view, slide, steps, deck, cache, transientState },
    nextKey: 1,
  }));
  if (state.current.view.index !== view.index) {
    setState({
      current: {
        key: state.nextKey,
        view,
        slide,
        steps,
        deck,
        cache,
        transientState,
      },
      retired: state.current,
      nextKey: state.nextKey + 1,
    });
  } else if (
    state.current.view !== view ||
    state.current.slide !== slide ||
    state.current.steps !== steps ||
    state.current.deck !== deck ||
    state.current.cache !== cache ||
    state.current.transientState !== transientState
  ) {
    setState({
      ...state,
      current: {
        key: state.current.key,
        view,
        slide,
        steps,
        deck,
        cache,
        transientState,
      },
      ...(state.current.cache !== cache ? { retired: undefined } : {}),
    });
  }
  const onCaptured = useCallback((key: number) => {
    setState((current) =>
      current.retired?.key === key
        ? { current: current.current, nextKey: current.nextKey }
        : current,
    );
  }, []);
  return (
    <Box sx={{ position: 'absolute', inset: 0, isolation: 'isolate' }}>
      {[
        ...(state.retired === undefined ? [] : [state.retired]),
        state.current,
      ].map((layer) => (
        <PresentedLayer
          key={layer.key}
          layer={layer}
          current={layer.key === state.current.key}
          active={!overview && layer.key === state.current.key}
          frameProps={frameProps}
          onFrame={onFrame}
          onCaptured={onCaptured}
        />
      ))}
    </Box>
  );
}
