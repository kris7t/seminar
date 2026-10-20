import { useEffect } from 'react';

import type { ThumbnailCache } from './ThumbnailCache.ts';
import { whenIdle } from './whenIdle.ts';

interface ThumbnailCaptureProps {
  cache: ThumbnailCache;
  index: number;
  frame: HTMLElement | null;
  active: boolean;
  onCaptured: () => void;
}

/** Captures a live slide without requiring a synchronous snapshot at unmount. */
export function ThumbnailCapture({
  cache,
  index,
  frame,
  active,
  onCaptured,
}: ThumbnailCaptureProps): null {
  useEffect(() => {
    if (frame === null) return undefined;
    cache.shown(index);
    const controller = new AbortController();
    if (!active) {
      void cache.capture(index, frame, true, controller.signal).then(() => {
        if (!controller.signal.aborted) onCaptured();
      });
      return () => {
        controller.abort();
      };
    }
    let cancel: (() => void) | undefined;
    let running = false;
    let dirty = false;
    const schedule = () => {
      dirty = true;
      if (cancel !== undefined || running || controller.signal.aborted) return;
      cancel = whenIdle(() => {
        cancel = undefined;
        running = true;
        dirty = false;
        void cache.capture(index, frame, true, controller.signal).then(() => {
          running = false;
          if (dirty) schedule();
        });
      });
    };
    const observer = new MutationObserver(schedule);
    observer.observe(frame, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    });
    const events = [
      'input',
      'change',
      'load',
      'error',
      'seeked',
      'transitionend',
      'animationend',
    ];
    for (const event of events) frame.addEventListener(event, schedule, true);
    if ('fonts' in document)
      document.fonts.addEventListener('loadingdone', schedule);
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
      cancel?.();
      observer.disconnect();
      clearInterval(timer);
      for (const event of events)
        frame.removeEventListener(event, schedule, true);
      if ('fonts' in document)
        document.fonts.removeEventListener('loadingdone', schedule);
    };
  }, [cache, index, frame, active, onCaptured]);
  return null;
}
