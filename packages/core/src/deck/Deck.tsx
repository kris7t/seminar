import { Box, CssBaseline, ThemeProvider, type Theme } from '@mui/material';
import {
  Children,
  isValidElement,
  useCallback,
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
import { useSlideIndex } from './useSlideIndex.ts';

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

function clamp(slideIndex: number, slideCount: number): number {
  return Math.max(0, Math.min(slideIndex, slideCount - 1));
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
  const [slideIndex, setSlideIndex] = useSlideIndex(
    slides.map(getSlideId),
    (index) => clamp(index, slideCount),
  );
  const [containerRef, scale] = useFitScale(SLIDE_WIDTH, SLIDE_HEIGHT);

  const goTo = useCallback(
    (newIndex: number) => {
      setSlideIndex(() => clamp(newIndex, slideCount));
    },
    [setSlideIndex, slideCount],
  );
  const next = useCallback(() => {
    setSlideIndex((index) => clamp(clamp(index, slideCount) + 1, slideCount));
  }, [setSlideIndex, slideCount]);
  const previous = useCallback(() => {
    setSlideIndex((index) => clamp(clamp(index, slideCount) - 1, slideCount));
  }, [setSlideIndex, slideCount]);

  const deck = useMemo<DeckState>(
    () => ({ slideIndex, slideCount, goTo, next, previous }),
    [slideIndex, slideCount, goTo, next, previous],
  );
  useKeyboardNavigation(deck);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <DeckContext value={deck}>
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
      </DeckContext>
    </ThemeProvider>
  );
}
