import { Box, ButtonBase, Typography } from '@mui/material';
import {
  use,
  useEffect,
  useMemo,
  useRef,
  type JSX,
  type MouseEventHandler,
  type ReactNode,
} from 'react';

import { useDeck } from '../deck/DeckContext.ts';
import { SlideStateContext } from '../state/SlideStateContext.ts';
import {
  SLIDE_VIEW_ATTRIBUTE,
  type SlideView,
} from '../slide/SlideViewContext.ts';
import { SlideViewProvider } from '../slide/SlideViewProvider.tsx';
import { StepStore } from '../steps/StepStore.ts';
import { StepStoreContext } from '../steps/StepStoreContext.ts';
import { SLIDE_HEIGHT, SLIDE_WIDTH } from '../theme/createSlideTheme.ts';

/** Scale of the thumbnails of the slides. */
const THUMBNAIL_SCALE = 0.2;

const THUMBNAIL_WIDTH = SLIDE_WIDTH * THUMBNAIL_SCALE;

const THUMBNAIL_HEIGHT = SLIDE_HEIGHT * THUMBNAIL_SCALE;

interface ThumbnailProps {
  index: number;
  slide: ReactNode;
  current: boolean;
  onSelect: (index: number) => void;
}

function Thumbnail({
  index,
  slide,
  current,
  onSelect,
}: ThumbnailProps): JSX.Element {
  const ref = useRef<HTMLButtonElement>(null);
  const view = useMemo<SlideView>(
    () => ({ index, kind: 'thumbnail', interactive: false }),
    [index],
  );
  // Show the steps last shown on the slide.
  const slideState = use(SlideStateContext);
  const stepStore = useMemo(
    () => new StepStore({ position: slideState.stepPosition(index) }),
    [slideState, index],
  );
  // Keep the focus on the current slide, so that Enter selects it when the
  // arrow keys change the current slide.
  useEffect(() => {
    if (current) {
      ref.current?.focus({ preventScroll: true });
      ref.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [current]);
  return (
    <Box
      sx={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        p: 1,
      }}
    >
      <Box
        {...{ [SLIDE_VIEW_ATTRIBUTE]: view.kind }}
        sx={[
          {
            position: 'relative',
            width: THUMBNAIL_WIDTH,
            height: THUMBNAIL_HEIGHT,
            overflow: 'hidden',
            bgcolor: 'background.default',
            color: 'text.primary',
          },
          current && { outline: '3px solid', outlineColor: 'primary.main' },
        ]}
      >
        {/* The contents of the slide can't be focused or clicked. */}
        <Box
          inert
          sx={{
            width: SLIDE_WIDTH,
            height: SLIDE_HEIGHT,
            transform: `scale(${String(THUMBNAIL_SCALE)})`,
            transformOrigin: 'top left',
            pointerEvents: 'none',
          }}
        >
          <StepStoreContext value={stepStore}>
            <SlideViewProvider view={view}>{slide}</SlideViewProvider>
          </StepStoreContext>
        </Box>
      </Box>
      <Typography
        variant="caption"
        sx={{
          color: current ? 'common.white' : 'grey.500',
          fontSize: 14,
          textAlign: 'center',
        }}
      >
        {index + 1}
      </Typography>
      {/*
       * Covers the thumbnail instead of containing it, since the contents of
       * a button would inherit its styles, like centered text.
       */}
      <ButtonBase
        ref={ref}
        aria-label={`Slide ${String(index + 1)}`}
        aria-current={current ? 'page' : undefined}
        onClick={() => {
          onSelect(index);
        }}
        sx={{
          position: 'absolute',
          inset: 0,
          borderRadius: 1,
          '&:hover, &.Mui-focusVisible': {
            outline: '2px solid',
            outlineColor: 'grey.500',
          },
        }}
      />
    </Box>
  );
}

export interface SlideOverviewProps {
  slides: readonly ReactNode[];
  onClose: () => void;
  onContextMenu?: MouseEventHandler | undefined;
}

/**
 * Shows the slides of the deck in a grid of thumbnail views, with the steps
 * last shown on each, and goes to a slide when it is clicked, keeping its
 * steps.
 *
 * The navigation keys move between the slides without changing their steps,
 * and Enter goes to the highlighted slide.
 *
 * Should be rendered with the theme of the slides.
 */
export function SlideOverview({
  slides,
  onClose,
  onContextMenu,
}: SlideOverviewProps): JSX.Element {
  const { slideIndex, goTo } = useDeck();
  const onSelect = (index: number) => {
    // Keep the steps shown in the thumbnail.
    goTo(index, 'restore');
    onClose();
  };
  return (
    <Box
      // Not a dialog, so that the navigation keys still work in it.
      role="region"
      aria-label="Slide overview"
      onContextMenu={onContextMenu}
      sx={{
        position: 'fixed',
        inset: 0,
        overflowY: 'auto',
        p: 2,
        bgcolor: 'grey.900',
      }}
    >
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: `repeat(auto-fill, minmax(${String(THUMBNAIL_WIDTH + 16)}px, 1fr))`,
          justifyItems: 'center',
          gap: 1,
        }}
      >
        {slides.map((slide, index) => (
          <Thumbnail
            // Slides are positional, so their indices identify them.
            // eslint-disable-next-line @eslint-react/no-array-index-key
            key={index}
            index={index}
            slide={slide}
            current={index === slideIndex}
            onSelect={onSelect}
          />
        ))}
      </Box>
    </Box>
  );
}
