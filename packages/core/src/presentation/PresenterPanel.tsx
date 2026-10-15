import { Box, ThemeProvider, Typography, type Theme } from '@mui/material';
import { use, useSyncExternalStore, type JSX, type ReactNode } from 'react';

import { useDeck } from '../deck/DeckContext.ts';
import { useFitScale, type Size } from '../deck/useFitScale.ts';
import { SLIDE_VIEW_ATTRIBUTE } from '../slide/SlideViewContext.ts';
import { SLIDE_FRAME_STYLES } from '../slide/slideFrame.ts';
import { StepStoreContext } from '../steps/StepStoreContext.ts';
import { SLIDE_WIDTH } from '../theme/createSlideTheme.ts';
import {
  fitsTwoPreviews,
  HEADING_HEIGHT,
  PANEL_GAP,
  PANEL_PADDING,
  previewSize,
  type PresenterLayout,
} from './presenterLayout.ts';
import { UpcomingSlide } from './UpcomingSlide.tsx';

/** Styles of the contents of notes, which may be Markdown. */
const NOTES_STYLES = {
  '& > :first-of-type, & > * > :first-of-type': { mt: 0 },
  '& > :last-child, & > * > :last-child': { mb: 0 },
  '& p, & ul, & ol': { my: 1 },
  '& ul, & ol': { pl: 3 },
} as const;

function Heading({ children }: { children: ReactNode }): JSX.Element {
  return (
    <Typography
      variant="overline"
      component="h2"
      sx={{
        flex: 'none',
        height: HEADING_HEIGHT,
        color: 'text.secondary',
        lineHeight: 2,
      }}
    >
      {children}
    </Typography>
  );
}

function useHasNextStep(): boolean {
  const steps = use(StepStoreContext);
  // The next step depends on the path and on the steps of the slide, which
  // both notify the listeners when they change.
  return useSyncExternalStore(steps.subscribe, () => steps.hasNext());
}

/** What a preview shows. */
interface Upcoming {
  heading: string;
  index: number;
  /** Whether to show the next step of the slide, or its beginning. */
  nextStep: boolean;
}

interface PreviewProps {
  upcoming: Upcoming | undefined;
  slides: readonly ReactNode[];
  size: Size;
  slideTheme: Theme;
}

function Preview({
  upcoming,
  slides,
  size,
  slideTheme,
}: PreviewProps): JSX.Element {
  return (
    <Box sx={{ flex: 'none', display: 'flex', flexDirection: 'column' }}>
      <Heading>{upcoming?.heading ?? 'Next slide'}</Heading>
      <Box
        sx={{ position: 'relative', overflow: 'hidden' }}
        style={{ width: size.width, height: size.height }}
      >
        {upcoming === undefined ? (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              bgcolor: 'common.black',
              color: 'text.secondary',
            }}
          >
            End of the presentation
          </Box>
        ) : (
          <ThemeProvider theme={slideTheme}>
            <Box
              inert
              sx={SLIDE_FRAME_STYLES}
              style={{
                transform: `scale(${String(size.width / SLIDE_WIDTH)})`,
              }}
              {...{ [SLIDE_VIEW_ATTRIBUTE]: 'preview' }}
            >
              <UpcomingSlide
                key={`${String(upcoming.index)}-${String(upcoming.nextStep)}`}
                index={upcoming.index}
                slide={slides[upcoming.index]}
                nextStep={upcoming.nextStep}
              />
            </Box>
          </ThemeProvider>
        )}
      </Box>
    </Box>
  );
}

export interface PresenterPanelProps {
  slides: readonly ReactNode[];
  /** The presenter notes of the current slide, if any. */
  notes: ReactNode;
  /** MUI theme of the slides, for the previews. */
  slideTheme: Theme;
  /** Whether the panel is below or next to the slide. */
  layout: PresenterLayout;
  /**
   * Whether to show only the notes, without the previews, to give them more
   * space.
   */
  notesOnly?: boolean;
}

/**
 * The panel of the presenter view, next to or below the current slide: what
 * the next step and the next slide will show, and the presenter notes of the
 * current slide.
 *
 * If the slide has more steps, the next slide is only shown along with the
 * next step if the panel has enough space for both.
 *
 * Should be rendered with the {@link darkUiTheme}.
 */
export function PresenterPanel({
  slides,
  notes,
  slideTheme,
  layout,
  notesOnly = false,
}: PresenterPanelProps): JSX.Element {
  const { slideIndex, slideCount } = useDeck();
  const nextStep = useHasNextStep();
  // The size of the contents of the panel, without its padding.
  const [ref, , panelSize] = useFitScale(SLIDE_WIDTH, SLIDE_WIDTH);
  const stacked = layout === 'stacked';
  const size = previewSize(layout, panelSize);
  const nextSlide: Upcoming | undefined =
    slideIndex + 1 < slideCount
      ? { heading: 'Next slide', index: slideIndex + 1, nextStep: false }
      : undefined;
  const upcoming: (Upcoming | undefined)[] = notesOnly
    ? []
    : nextStep
      ? [
          { heading: 'Next step', index: slideIndex, nextStep: true },
          ...(nextSlide !== undefined && fitsTwoPreviews(layout, panelSize)
            ? [nextSlide]
            : []),
        ]
      : [nextSlide];
  return (
    <Box
      ref={ref}
      component="aside"
      aria-label="Presenter view"
      sx={{
        flex: 1,
        display: 'flex',
        // Below the slide, the previews and the notes are side by side.
        flexDirection: stacked ? 'row' : 'column',
        minWidth: 0,
        minHeight: 0,
        p: `${String(PANEL_PADDING)}px`,
        gap: `${String(PANEL_GAP)}px`,
        bgcolor: 'background.default',
        color: 'text.primary',
      }}
    >
      {upcoming.map((item) => (
        <Preview
          key={item?.heading ?? 'end'}
          upcoming={item}
          slides={slides}
          size={size}
          slideTheme={slideTheme}
        />
      ))}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          minHeight: 0,
        }}
      >
        <Heading>Notes</Heading>
        <Box
          sx={[
            NOTES_STYLES,
            {
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              typography: 'body1',
              fontSize: '1.25rem',
            },
          ]}
        >
          {notes ?? (
            <Typography sx={{ color: 'text.secondary' }}>No notes</Typography>
          )}
        </Box>
      </Box>
    </Box>
  );
}
