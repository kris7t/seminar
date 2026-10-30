import { use, useCallback, useEffect, useLayoutEffect, useRef } from 'react';

import { StepStoreContext } from '../steps/StepStoreContext.ts';
import { getInteraction } from '../interaction/interaction.ts';
import type { SlideViewKind } from '../view/SlideViewContext.ts';
import type { ThumbnailCache, ThumbnailState } from './ThumbnailCache.ts';
import { whenIdle } from './whenIdle.ts';

interface ThumbnailCaptureProps {
  cache: ThumbnailCache;
  index: number;
  kind: SlideViewKind;
  frame: HTMLElement | null;
  active: boolean;
  current: boolean;
  onCaptured: () => void;
}

/** Captures a live slide without requiring a synchronous snapshot at unmount. */
export function ThumbnailCapture({
  cache,
  index,
  kind,
  frame,
  active,
  current,
  onCaptured,
}: ThumbnailCaptureProps): null {
  const steps = use(StepStoreContext);
  const getState = useCallback(
    (): ThumbnailState => ({
      path: `${steps.getPath().join('.')}/${kind}`,
    }),
    [steps, kind],
  );
  const activeRef = useRef(active);
  useLayoutEffect(() => {
    activeRef.current = active;
  }, [active]);
  useEffect(() => {
    if (frame === null) return undefined;
    const releaseShown = cache.shown(index);
    if (!active) {
      let captureController: AbortController | undefined;
      let cancel: (() => void) | undefined;
      const capture = () => {
        captureController?.abort();
        captureController = new AbortController();
        const signal = captureController.signal;
        void cache.capture(index, frame, true, signal, getState()).then(() => {
          if (!signal.aborted) onCaptured();
        });
      };
      const unsubscribe = cache.subscribeInvalidation(index, () => {
        captureController?.abort();
        cancel?.();
        if (!current) {
          // A departed visit can retain transient values from before a reset.
          onCaptured();
          return;
        }
        // State notifications precede React's commit of the updated slide.
        cancel = whenIdle(capture);
      });
      capture();
      return () => {
        captureController?.abort();
        unsubscribe();
        cancel?.();
        releaseShown();
      };
    }
    const controller = new AbortController();
    let cancel: (() => void) | undefined;
    let running = false;
    let dirty = false;
    let captureController: AbortController | undefined;
    let state = getState();
    let reused = cache.restore(index, state);
    const schedule = (force = false) => {
      if (!activeRef.current || controller.signal.aborted) return;
      if (cache.checkFailed(index, frame)) return;
      const next = getState();
      if (next.path !== state.path) {
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
      if (next.path !== state.path) schedule();
    });
    const unsubscribeState = cache.subscribeInvalidation(index, () => {
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
      unsubscribeState();
      releaseShown();
      clearInterval(timer);
      for (const event of events)
        frame.removeEventListener(event, onEvent, true);
      if ('fonts' in document)
        document.fonts.removeEventListener('loadingdone', onFonts);
    };
  }, [cache, index, frame, active, current, onCaptured, getState, steps]);
  return null;
}
