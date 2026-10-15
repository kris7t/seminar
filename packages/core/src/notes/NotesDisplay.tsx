import { Box, ButtonBase, ThemeProvider } from '@mui/material';
import {
  useCallback,
  useState,
  type JSX,
  type ReactNode,
  type RefCallback,
} from 'react';

import type { Size } from '../deck/useFitScale.ts';
import { INTERACTIVE_ATTRIBUTE } from '../interaction/interaction.ts';
import { uiTheme } from '../menu/uiTheme.ts';
import { SLIDE_HEIGHT } from '../theme/createSlideTheme.ts';
import { useFullscreen } from './useFullscreen.ts';

/** Styles of the contents of notes, which may be Markdown. */
const NOTES_STYLES = {
  typography: 'body2',
  '& > :first-of-type, & > * > :first-of-type': { mt: 0 },
  '& > :last-child, & > * > :last-child': { mb: 0 },
  '& p, & ul, & ol': { my: 0.5 },
  '& ul, & ol': { pl: 3 },
} as const;

/** Height of the notes in the collapsed overlay. */
const COLLAPSED_HEIGHT = '3em';

function useHeight(): [RefCallback<HTMLElement>, number] {
  const [height, setHeight] = useState(Number.POSITIVE_INFINITY);
  const ref = useCallback<RefCallback<HTMLElement>>((element) => {
    if (element === null) {
      return undefined;
    }
    const observer = new ResizeObserver(() => {
      setHeight(element.offsetHeight);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);
  return [ref, height];
}

export interface NotesDisplayProps {
  notes: ReactNode;
  /** Size of the area of the slide, including the black bars. */
  size: Size;
  /** Scale of the slide in the area. */
  scale: number;
}

/**
 * Shows the presenter notes of the current slide in the black bar below the
 * slide, aligned to its bottom.
 *
 * If the notes don't fit there, e.g., because the window is as wide as the
 * slide, the bottom of the window is darkened with a gradient that shows the
 * beginning of the notes, which can be expanded to show all of them over the
 * slide. Both span the whole width of the window, which fits more text, and
 * doesn't have to line up with the edges of the scaled slide.
 *
 * The notes are hidden in full screen, which is how slides are shown to the
 * audience.
 */
export function NotesDisplay({
  notes,
  size,
  scale,
}: NotesDisplayProps): JSX.Element | null {
  const fullscreen = useFullscreen();
  const [measureRef, notesHeight] = useHeight();
  const [expanded, setExpanded] = useState(false);
  if (fullscreen) {
    return null;
  }
  const barHeight = Math.max((size.height - SLIDE_HEIGHT * scale) / 2, 0);
  // Expanded notes may cover most of the slide.
  const expandedHeight = size.height * 0.6;
  const fits = notesHeight <= barHeight;
  return (
    <ThemeProvider theme={uiTheme}>
      {/* Also measures the notes when they don't fit. */}
      <Box
        ref={measureRef}
        aria-label="Presenter notes"
        aria-hidden={!fits}
        sx={[
          NOTES_STYLES,
          {
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            px: 2,
            py: 1,
            color: 'grey.400',
          },
          !fits && { visibility: 'hidden' },
        ]}
      >
        {notes}
      </Box>
      {!fits && (
        <Box
          {...{ [INTERACTIVE_ATTRIBUTE]: true }}
          aria-label="Presenter notes"
          sx={[
            {
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              display: 'flex',
              alignItems: 'flex-end',
              gap: 1,
              px: 2,
              pb: 1,
              color: 'common.white',
            },
            expanded
              ? {
                  pt: 1,
                  maxHeight: expandedHeight,
                  bgcolor: 'rgb(0 0 0 / 80%)',
                }
              : {
                  pt: 4,
                  background:
                    'linear-gradient(to bottom, transparent, rgb(0 0 0 / 70%))',
                },
          ]}
        >
          <Box
            sx={[
              NOTES_STYLES,
              { flex: 1, minWidth: 0 },
              expanded
                ? { maxHeight: expandedHeight - 16, overflowY: 'auto' }
                : {
                    maxHeight: COLLAPSED_HEIGHT,
                    overflow: 'hidden',
                    maskImage:
                      'linear-gradient(to bottom, black 50%, transparent)',
                  },
            ]}
          >
            {notes}
          </Box>
          <ButtonBase
            aria-expanded={expanded}
            onClick={() => {
              setExpanded(!expanded);
            }}
            sx={{
              flex: 'none',
              typography: 'body2',
              fontWeight: 500,
              borderRadius: 1,
              px: 0.5,
            }}
          >
            {expanded ? 'less' : 'more'}
          </ButtonBase>
        </Box>
      )}
    </ThemeProvider>
  );
}
