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
import { useKeyboardNavigation } from '../interaction/useKeyboardNavigation.ts';
import { INTERACTIVE_ATTRIBUTE } from '../interaction/interaction.ts';
import { useClickNavigation } from '../interaction/useClickNavigation.ts';
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
  /**
   * Whether clicking on the slides navigates (see {@link useClickNavigation}).
   * Defaults to `true`.
   *
   * With mouse navigation, text on the slides can't be selected, except in
   * text fields and elements with the `data-slider-interactive` attribute,
   * since selecting text with the mouse would interfere with clicking.
   */
  mouseNavigation?: boolean;
}

const SELECTABLE_SELECTOR = [
  `[${INTERACTIVE_ATTRIBUTE}]`,
  'input',
  'textarea',
  '[contenteditable]',
]
  .map((selector) => `& ${selector}`)
  .join(', ');

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
  mouseNavigation = true,
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
    firstStep,
    lastStep,
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
      firstStep,
      lastStep,
    }),
    [
      slideIndex,
      slideCount,
      goTo,
      next,
      previous,
      nextSlide,
      previousSlide,
      firstStep,
      lastStep,
    ],
  );
  useKeyboardNavigation(deck);
  const onClick = useClickNavigation(next, previous);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <DeckContext value={deck}>
        <StepStoreContext value={stepStore}>
          <Box
            ref={containerRef}
            onClick={mouseNavigation ? onClick : undefined}
            sx={[
              {
                position: 'fixed',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                bgcolor: 'common.black',
              },
              mouseNavigation && {
                userSelect: 'none',
                [SELECTABLE_SELECTOR]: { userSelect: 'text' },
              },
            ]}
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
