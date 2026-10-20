import { useLayoutEffect, type ReactNode } from 'react';

import type { ThumbnailCache } from './ThumbnailCache.ts';
import { whenIdle } from './whenIdle.ts';

interface ThumbnailCaptureProps {
  cache: ThumbnailCache;
  index: number;
  frame: HTMLElement | null;
  children: ReactNode;
}

/** Tracks the appearance of the interactive slide, including its final frame. */
export function ThumbnailCapture({
  cache,
  index,
  frame,
  children,
}: ThumbnailCaptureProps): ReactNode {
  useLayoutEffect(() => {
    if (frame === null) {
      return undefined;
    }
    cache.shown(index);
    let cancel: (() => void) | undefined;
    let running = false;
    let dirty = true;
    let mounted = true;
    const schedule = () => {
      dirty = true;
      if (cancel !== undefined || running || !mounted) {
        return;
      }
      cancel = whenIdle(() => {
        cancel = undefined;
        running = true;
        dirty = false;
        void cache.capture(index, frame, true).then(() => {
          running = false;
          if (dirty) {
            schedule();
          }
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
    for (const event of events) {
      frame.addEventListener(event, schedule, true);
    }
    if ('fonts' in document) {
      document.fonts.addEventListener('loadingdone', schedule);
    }
    // Canvas drawing and media playback don't change the DOM.
    const timer = setInterval(() => {
      if (
        frame.querySelector('canvas, video') !== null ||
        ('getAnimations' in frame &&
          frame
            .getAnimations({ subtree: true })
            .some((animation) => animation.playState === 'running'))
      ) {
        schedule();
      }
    }, 1000);
    schedule();
    return () => {
      mounted = false;
      cancel?.();
      observer.disconnect();
      clearInterval(timer);
      if ('fonts' in document) {
        document.fonts.removeEventListener('loadingdone', schedule);
      }
      for (const event of events) {
        frame.removeEventListener(event, schedule, true);
      }
      // Layout cleanup runs before React removes this subtree. Freeze it now,
      // even when navigation happened before its idle capture could run.
      void cache.capture(index, frame, true);
    };
  }, [cache, index, frame]);
  return children;
}
