import { Box, CssBaseline, ThemeProvider, type Theme } from '@mui/material';
import {
  Children,
  isValidElement,
  useMemo,
  type JSX,
  type ReactNode,
} from 'react';

import { DeckContext, type DeckState } from './DeckContext.ts';
import {
  defaultSlideTheme,
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
} from '../theme/createSlideTheme.ts';
import { useFitScale } from './useFitScale.ts';
import { useKeyboardNavigation } from './useKeyboardNavigation.ts';
import { useDeckNavigation } from './useDeckNavigation.ts';
import { StepStoreContext } from '../steps/StepStoreContext.ts';

export interface DeckProps {
  /**
   * The slides of the deck, usually {@link Slide} elements.
   *
   * The `id` prop of a slide is used as the location hash when it is shown.
   */
  children?: ReactNode;
  /** MUI theme of the slides. Defaults to {@link defaultSlideTheme}. */
  theme?: Theme;
}

function getSlideId(slide: ReturnType<typeof Children.toArray>[number]) {
  if (isValidElement<{ id?: unknown }>(slide)) {
    const { id } = slide.props;
    if (typeof id === 'string' && id !== '') {
      return id;
    }
  }
  return undefined;
}

/**
 * Shows one of its child slides at a time, scaled to fit the viewport.
 */
export function Deck({
  children,
  theme = defaultSlideTheme,
}: DeckProps): JSX.Element {
  // Slides are positional children, so we need to index into them.
  // eslint-disable-next-line @eslint-react/no-children-to-array
  const slides = Children.toArray(children);
  const slideCount = slides.length;
  const {
    slideIndex,
    stepStore,
    goTo,
    next,
    previous,
    nextSlide,
    previousSlide,
  } = useDeckNavigation(slides.map(getSlideId));
  const [containerRef, scale] = useFitScale(SLIDE_WIDTH, SLIDE_HEIGHT);

  const deck = useMemo<DeckState>(
    () => ({
      slideIndex,
      slideCount,
      goTo,
      next,
      previous,
      nextSlide,
      previousSlide,
    }),
    [slideIndex, slideCount, goTo, next, previous, nextSlide, previousSlide],
  );
  useKeyboardNavigation(deck);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <DeckContext value={deck}>
        <StepStoreContext value={stepStore}>
          <Box
            ref={containerRef}
            sx={{
              position: 'fixed',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              bgcolor: 'common.black',
            }}
          >
            <Box
              sx={{
                flex: 'none',
                position: 'relative',
                width: SLIDE_WIDTH,
                height: SLIDE_HEIGHT,
                overflow: 'hidden',
                bgcolor: 'background.default',
                color: 'text.primary',
              }}
              style={{ transform: `scale(${String(scale)})` }}
            >
              {slides[slideIndex]}
            </Box>
          </Box>
        </StepStoreContext>
      </DeckContext>
    </ThemeProvider>
  );
}
