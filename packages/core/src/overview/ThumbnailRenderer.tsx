import { Box } from '@mui/material';
import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
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
  { children: ReactNode; onSkip: () => void },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(): void {
    this.props.onSkip();
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
}: {
  cache: ThumbnailCache;
  slides: readonly ReactNode[];
  shownIndex: number | undefined;
}): ReactNode {
  const [index, setIndex] = useState<number>();
  const [owner, setOwner] = useState(cache);
  const [transitions] = useState(() => new SlideTransitions());
  if (owner !== cache) {
    setOwner(cache);
    setIndex(undefined);
  }
  if (index !== undefined && index === shownIndex) {
    setIndex(undefined);
  }
  useEffect(() => {
    if (index !== undefined) {
      return undefined;
    }
    const next = cache.nextMissing(slides.length);
    return next === undefined
      ? undefined
      : whenIdle(() => {
          // A slide may have been shown while this idle task was waiting.
          setIndex(cache.nextMissing(slides.length));
        });
  }, [cache, slides.length, index]);
  const onDone = useCallback(() => {
    setIndex(undefined);
  }, []);
  const onSkip = useCallback(() => {
    if (index !== undefined) {
      cache.skip(index);
    }
    onDone();
  }, [cache, index, onDone]);
  return index === undefined ? null : (
    // Loading in the background must not hold the transitions of the deck.
    <SlideTransitionsContext value={transitions}>
      <ThumbnailBoundary key={index} onSkip={onSkip}>
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
