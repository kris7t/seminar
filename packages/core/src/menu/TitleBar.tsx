import { Box, Typography, type BoxProps } from '@mui/material';
import { useSyncExternalStore, type JSX, type ReactNode } from 'react';

import type { TitleBar as TitleBarArea } from './useTitleBar.ts';

/** Lets the window be moved by dragging the element, like a title bar. */
export const DRAG_REGION = { WebkitAppRegion: 'drag' } as const;

/** Lets controls in a {@link DRAG_REGION} be clicked. */
export const NO_DRAG_REGION = { WebkitAppRegion: 'no-drag' } as const;

function subscribeToTitle(listener: () => void): () => void {
  // The title element may be added or replaced, too.
  const observer = new MutationObserver(listener);
  observer.observe(document.head, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  return () => {
    observer.disconnect();
  };
}

function getTitle(): string {
  return document.title;
}

/** Returns the title of the document, which is the title of its window. */
function useDocumentTitle(): string {
  return useSyncExternalStore(subscribeToTitle, getTitle, () => '');
}

/**
 * Width that the title of the window should have room for, in pixels, e.g.,
 * when choosing which buttons to show next to it.
 */
export const TITLE_WIDTH = 200;

/** The title of the window, cut off if there isn't enough room for it. */
function WindowTitle(): JSX.Element {
  const title = useDocumentTitle();
  return (
    <Typography
      variant="body2"
      noWrap
      sx={{
        position: 'relative',
        px: 2,
        color: 'text.primary',
        textAlign: 'center',
        fontWeight: 'medium',
      }}
    >
      {title}
    </Typography>
  );
}

export interface TitleBarProps extends Pick<
  BoxProps,
  'role' | 'aria-label' | 'onMouseDown'
> {
  area: TitleBarArea;
  /** The background color, which the window controls are drawn on, too. */
  color: string;
  /** Shown at the start of the title bar, after the window controls there. */
  start?: ReactNode;
  /** Shown at the end of the title bar, before the window controls there. */
  end?: ReactNode;
  /**
   * Whether a line separates the title bar from what's below, inside of its
   * height, so that what's below doesn't move with the line.
   */
  divider?: boolean;
}

/**
 * Title bar of the window, if the page draws it, with the title of the
 * document, which moves the window when dragged, except by its controls, see
 * {@link NO_DRAG_REGION}.
 *
 * Like the header bars of GNOME, the title is centered in the window, unless
 * what's on one side needs that room, which moves the title to the other
 * side, and is cut off only if there's no room left.
 *
 * Should be rendered with the {@link darkUiTheme}, at the top of the window,
 * spanning it.
 */
export function TitleBar({
  area,
  color,
  start,
  end,
  divider = false,
  ...props
}: TitleBarProps): JSX.Element {
  return (
    <Box
      component="header"
      {...props}
      sx={{
        position: 'relative',
        flex: 'none',
        display: 'grid',
        // The sides take the same room if they fit, which centers the title,
        // or the room that they need, which moves the title over.
        gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'center',
        height: area.height,
        overflow: 'hidden',
        color: 'text.primary',
        '& button': NO_DRAG_REGION,
      }}
    >
      <Box
        sx={{
          ...DRAG_REGION,
          position: 'absolute',
          inset: 0,
          bgcolor: color,
          ...(divider && { borderBottom: 1, borderColor: 'divider' }),
        }}
      />
      <Box
        sx={{
          position: 'relative',
          display: 'flex',
          pl: `${String(area.left)}px`,
        }}
      >
        {start}
      </Box>
      <WindowTitle />
      <Box
        sx={{
          position: 'relative',
          display: 'flex',
          justifyContent: 'flex-end',
          pr: `${String(area.right)}px`,
        }}
      >
        {end}
      </Box>
    </Box>
  );
}
