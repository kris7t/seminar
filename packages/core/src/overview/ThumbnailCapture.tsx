import { use, useCallback, useEffect, useLayoutEffect, useRef } from 'react';

import { DeckStateContext } from '../state/DeckStateContext.ts';
import { SlideStateContext } from '../state/SlideStateContext.ts';
import { StepStoreContext } from '../steps/StepStoreContext.ts';
import { getInteraction } from '../interaction/interaction.ts';
import type { SlideViewKind } from '../view/SlideViewContext.ts';
import type { ThumbnailCache, ThumbnailState } from './ThumbnailCache.ts';
import { whenIdle } from './whenIdle.ts';

interface ThumbnailCaptureProps {
  cache: ThumbnailCache;
  index: number;
  stateIndex: number;
  kind: SlideViewKind;
  frame: HTMLElement | null;
  active: boolean;
  onCaptured: () => void;
}

/** Captures a live slide without requiring a synchronous snapshot at unmount. */
export function ThumbnailCapture({
  cache,
  index,
  stateIndex,
  kind,
  frame,
  active,
  onCaptured,
}: ThumbnailCaptureProps): null {
  const deck = use(DeckStateContext);
  const slide = use(SlideStateContext);
  const steps = use(StepStoreContext);
  const getState = useCallback(
    (): ThumbnailState => ({
      generation: `${cache.usesDeckState(index) ? String(deck.getGeneration()) : 'independent'}/${String(slide.getGeneration(stateIndex))}`,
      path: `${steps.getPath().join('.')}/${kind}`,
    }),
    [cache, index, deck, slide, stateIndex, steps, kind],
  );
  const activeRef = useRef(active);
  useLayoutEffect(() => {
    activeRef.current = active;
  }, [active]);
  useEffect(() => {
    if (frame === null) return undefined;
    cache.shown(index);
    const controller = new AbortController();
    if (!active) {
      void cache
        .capture(index, frame, true, controller.signal, getState())
        .then(() => {
          if (!controller.signal.aborted) onCaptured();
        });
      return () => {
        controller.abort();
      };
    }
    let cancel: (() => void) | undefined;
    let running = false;
    let dirty = false;
    let captureController: AbortController | undefined;
    let state = getState();
    let reused = cache.restore(index, state);
    const schedule = (force = false) => {
      if (!activeRef.current || controller.signal.aborted) return;
      const next = getState();
      if (next.generation !== state.generation || next.path !== state.path) {
        captureController?.abort();
        state = next;
        reused = cache.restore(index, state);
      }
      // Reconstructing an unchanged slide, including asynchronously rendered
      // formulas, doesn't change the last appearance we already captured.
      if (reused && !force && cache.isCurrent(index, state)) {
        dirty = false;
        cancel?.();
        cancel = undefined;
        return;
      }
      reused = false;
      cache.invalidate(index, state);
      dirty = true;
      captureController?.abort();
      cancel?.();
      cancel = undefined;
      if (running) return;
      // Wait for typing, animation mutations, and asynchronous formulas to
      // settle before copying the slide. Departing slides bypass this delay.
      const timeout = setTimeout(() => {
        cancel = whenIdle(() => {
          cancel = undefined;
          running = true;
          dirty = false;
          captureController = new AbortController();
          void cache
            .capture(index, frame, true, captureController.signal, getState())
            .then(() => {
              running = false;
              if (dirty) schedule();
            });
        });
      }, 200);
      cancel = () => {
        clearTimeout(timeout);
      };
    };
    const observer = new MutationObserver((records) => {
      // The fitted frame changes scale and interaction flags independently
      // of the logical slide whose appearance is cached.
      if (records.some((record) => record.target !== frame)) schedule();
    });
    observer.observe(frame, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    });
    const unsubscribeSteps = steps.subscribe(() => {
      const next = getState();
      if (next.generation !== state.generation || next.path !== state.path)
        schedule();
    });
    const events = [
      'input',
      'change',
      'click',
      'load',
      'error',
      'seeked',
      'transitionend',
      'animationend',
    ];
    const onEvent = (event: Event) => {
      schedule(
        event.type === 'input' ||
          event.type === 'change' ||
          (event.type === 'click' &&
            getInteraction(event.target) !== undefined),
      );
    };
    const onFonts = () => {
      schedule();
    };
    for (const event of events) frame.addEventListener(event, onEvent, true);
    if ('fonts' in document)
      document.fonts.addEventListener('loadingdone', onFonts);
    const timer = setInterval(() => {
      if (
        frame.querySelector('canvas, video') !== null ||
        ('getAnimations' in frame &&
          frame
            .getAnimations({ subtree: true })
            .some((animation) => animation.playState === 'running'))
      )
        schedule();
    }, 1000);
    schedule();
    return () => {
      controller.abort();
      captureController?.abort();
      cancel?.();
      observer.disconnect();
      unsubscribeSteps();
      clearInterval(timer);
      for (const event of events)
        frame.removeEventListener(event, onEvent, true);
      if ('fonts' in document)
        document.fonts.removeEventListener('loadingdone', onFonts);
    };
  }, [cache, index, frame, active, onCaptured, getState, steps]);
  return null;
}
