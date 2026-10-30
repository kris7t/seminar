import { Box } from '@mui/material';
import {
  Component,
  Suspense,
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type JSX,
  type ReactNode,
} from 'react';

import { SLIDE_HEIGHT, SLIDE_WIDTH } from '../theme/createSlideTheme.ts';
import { SLIDE_VIEW_ATTRIBUTE } from '../view/SlideViewContext.ts';
import { SlideMirror } from '../view/SlideMirror.tsx';
import {
  SlideTransitions,
  SlideTransitionsContext,
} from '../transitions/SlideTransitions.ts';
import type { ThumbnailCache } from './ThumbnailCache.ts';
import { whenIdle } from './whenIdle.ts';

class ThumbnailBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(): void {
    this.props.onError();
  }

  override render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

/** A suspended slide can be captured when it is eventually shown. */
function SkipThumbnail({ onSkip }: { onSkip: () => void }): null {
  useEffect(onSkip, [onSkip]);
  return null;
}

function BackgroundThumbnail({
  cache,
  index,
  slide,
  onDone,
}: {
  cache: ThumbnailCache;
  index: number;
  slide: ReactNode;
  onDone: () => void;
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    let cancel: (() => void) | undefined;
    const frame = ref.current;
    if (frame === null) {
      return undefined;
    }
    // Give intrinsic image sizes and fonts a chance to settle, without
    // letting an unavailable resource stall all the following thumbnails.
    let ready = false;
    const capture = () => {
      if (ready || !mounted) {
        return;
      }
      ready = true;
      clearTimeout(timeout);
      cancel = whenIdle(() => {
        void cache.capture(index, frame, false, controller.signal).then(() => {
          if (mounted) {
            onDone();
          }
        });
      });
    };
    const timeout = setTimeout(capture, 2000);
    void Promise.allSettled([
      ...('fonts' in document ? [document.fonts.ready] : []),
      ...[...frame.querySelectorAll('img')].map((image) =>
        'decode' in image ? image.decode() : undefined,
      ),
    ]).then(capture);
    return () => {
      mounted = false;
      controller.abort();
      cancel?.();
      clearTimeout(timeout);
    };
  }, [cache, index, onDone]);
  return (
    <Box
      ref={ref}
      {...{ [SLIDE_VIEW_ATTRIBUTE]: 'thumbnail' }}
      inert
      aria-hidden
      sx={{
        position: 'fixed',
        left: -100000,
        top: 0,
        width: SLIDE_WIDTH,
        height: SLIDE_HEIGHT,
        overflow: 'hidden',
        bgcolor: 'background.default',
        color: 'text.primary',
        pointerEvents: 'none',
      }}
    >
      <SlideMirror index={index} slide={slide} kind="thumbnail" />
    </Box>
  );
}

/** Fills the cache one slide at a time, yielding between slides. */
export function ThumbnailRenderer({
  cache,
  slides,
  shownIndex,
  priorityIndex = shownIndex ?? 0,
  paused = false,
}: {
  cache: ThumbnailCache;
  slides: readonly ReactNode[];
  shownIndex: number | undefined;
  priorityIndex?: number;
  paused?: boolean;
}): ReactNode {
  const [job, setJob] = useState<{
    index: number;
    invalidation: symbol | undefined;
  }>();
  const index = job?.index;
  const setIndex = useCallback(
    (next: number | undefined) => {
      setJob(
        next === undefined
          ? undefined
          : { index: next, invalidation: cache.getInvalidation(next) },
      );
    },
    [cache],
  );
  const [owner, setOwner] = useState(cache);
  const [priority, setPriority] = useState(priorityIndex);
  const [transitions] = useState(() => new SlideTransitions());
  const presentedTransitions = use(SlideTransitionsContext);
  const transitioning = useSyncExternalStore(
    presentedTransitions.subscribe,
    () => presentedTransitions.running,
  );
  const capturingShown = useSyncExternalStore(
    cache.subscribe,
    cache.isCapturingShown,
  );
  const visibility = useSyncExternalStore(
    cache.subscribe,
    cache.getVisibilityVersion,
  );
  const queue = useSyncExternalStore(cache.subscribe, cache.getQueueVersion);
  const blocked = paused || transitioning || capturingShown;
  if (owner !== cache) {
    setOwner(cache);
    setIndex(undefined);
  }
  if (priority !== priorityIndex) {
    setPriority(priorityIndex);
    setIndex(undefined);
  }
  if (
    index !== undefined &&
    (index === shownIndex ||
      blocked ||
      job?.invalidation !== cache.getInvalidation(index))
  ) {
    setIndex(undefined);
  }
  if (index !== undefined && !cache.isVisible(index)) {
    const next = cache.nextMissing(slides.length, priorityIndex);
    if (next !== undefined && cache.isVisible(next)) setIndex(undefined);
  }
  useEffect(() => {
    if (index !== undefined || blocked) {
      return undefined;
    }
    const next = cache.nextMissing(slides.length, priorityIndex);
    return next === undefined
      ? undefined
      : whenIdle(() => {
          // A slide may have been shown while this idle task was waiting.
          setIndex(cache.nextMissing(slides.length, priorityIndex));
        });
  }, [
    cache,
    slides.length,
    index,
    priorityIndex,
    blocked,
    visibility,
    queue,
    setIndex,
  ]);
  const onDone = useCallback(() => {
    setIndex(undefined);
  }, [setIndex]);
  const onSkip = useCallback(() => {
    if (index !== undefined) {
      cache.skip(index);
    }
    onDone();
  }, [cache, index, onDone]);
  const onError = useCallback(() => {
    if (index !== undefined) cache.setFailed(index, true);
    onSkip();
  }, [cache, index, onSkip]);
  return index === undefined ? null : (
    // Loading in the background must not hold the transitions of the deck.
    <SlideTransitionsContext value={transitions}>
      <ThumbnailBoundary key={index} onError={onError}>
        <Suspense fallback={<SkipThumbnail onSkip={onSkip} />}>
          <BackgroundThumbnail
            cache={cache}
            index={index}
            slide={slides[index]}
            onDone={onDone}
          />
        </Suspense>
      </ThumbnailBoundary>
    </SlideTransitionsContext>
  );
}
