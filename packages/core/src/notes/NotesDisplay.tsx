import { Box, ButtonBase } from '@mui/material';
import { useState, type JSX, type ReactNode, type RefCallback } from 'react';

import { useT } from '../i18n/UiLanguageContext.ts';
import type { Size } from '../view/useFitScale.ts';
import {
  INTERACTIVE_ATTRIBUTE,
  SELECTABLE_ATTRIBUTE,
} from '../interaction/interaction.ts';
import { UiThemeProvider } from '../menu/UiThemeProvider.tsx';
import { useMeasure } from '../transitions/settling.ts';
import { SLIDE_HEIGHT } from '../theme/createSlideTheme.ts';
import { useFullscreen } from '../presentation/useFullscreen.ts';

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

/** Measures the height of an element before it's painted. */
function useHeight(): [RefCallback<HTMLElement>, number] {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [height, setHeight] = useState(Number.POSITIVE_INFINITY);
  useMeasure(element, () => {
    if (element !== null) {
      setHeight(element.offsetHeight);
    }
  });
  return [setElement, height];
}

export interface NotesDisplayProps {
  notes: ReactNode;
  /** The language of the notes, if known. */
  notesLang?: string | undefined;
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
  notesLang,
  size,
  scale,
}: NotesDisplayProps): JSX.Element | null {
  const t = useT();
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
    <UiThemeProvider dark>
      {/* Also measures the notes when they don't fit. */}
      <Box
        ref={measureRef}
        // Clicks select the notes, rather than going to the next step.
        {...(fits ? { [SELECTABLE_ATTRIBUTE]: true } : {})}
        lang={notesLang}
        aria-label={t('presenterNotes')}
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
            color: 'text.secondary',
            // Shown only if the notes fit, so this only clips them until they
            // are measured, without a scrollbar flashing.
            overflow: 'hidden',
          },
          !fits && { visibility: 'hidden' },
        ]}
      >
        {notes}
      </Box>
      {!fits && (
        <Box
          // Collapsed, the notes let clicks through to the slide, except on
          // the button that expands them.
          {...(expanded ? { [INTERACTIVE_ATTRIBUTE]: true } : {})}
          lang={notesLang}
          aria-label={t('presenterNotes')}
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
              color: 'text.primary',
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
                  pointerEvents: 'none',
                },
          ]}
        >
          <Box
            sx={[
              NOTES_STYLES,
              { flex: 1, minWidth: 0 },
              expanded
                ? {
                    maxHeight: expandedHeight - 16,
                    overflowY: 'auto',
                    scrollbarWidth: 'thin',
                  }
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
              pointerEvents: 'auto',
            }}
          >
            {expanded ? 'less' : 'more'}
          </ButtonBase>
        </Box>
      )}
    </UiThemeProvider>
  );
}
