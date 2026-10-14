import CloseIcon from '@mui/icons-material/Close';
import {
  Box,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Typography,
} from '@mui/material';
import type { JSX } from 'react';

import { useDeck } from '../deck/DeckContext.ts';
import { findCurrentEntry, type ResolvedTocEntry } from './tableOfContents.ts';

/** Width of the sidebar in CSS pixels. */
export const TOC_WIDTH = 280;

interface RenderEntriesOptions {
  entries: readonly ResolvedTocEntry[];
  level: number;
  current: number | undefined;
  goTo: (slideIndex: number) => void;
}

function renderEntries({
  entries,
  level,
  current,
  goTo,
}: RenderEntriesOptions): JSX.Element[] {
  return entries.flatMap((entry) => [
    <ListItemButton
      key={`entry-${String(entry.slideIndex)}`}
      selected={entry.slideIndex === current}
      aria-current={entry.slideIndex === current ? 'page' : undefined}
      onClick={() => {
        goTo(entry.slideIndex);
      }}
      sx={{ pl: 2 + level * 2 }}
    >
      <ListItemText
        slotProps={{
          primary: {
            variant: 'body2',
            sx: { fontWeight: level === 0 ? 500 : undefined },
          },
        }}
      >
        {entry.title}
      </ListItemText>
    </ListItemButton>,
    ...renderEntries({
      entries: entry.children,
      level: level + 1,
      current,
      goTo,
    }),
  ]);
}

export interface TocSidebarProps {
  onClose: () => void;
}

/**
 * Sidebar with the table of contents of the deck, which highlights the entry
 * of the current slide and goes to the slide of an entry when clicked.
 *
 * Should be rendered with the {@link uiTheme}.
 */
export function TocSidebar({ onClose }: TocSidebarProps): JSX.Element {
  const { toc, slideIndex, goTo } = useDeck();
  const current = findCurrentEntry(toc, slideIndex);
  return (
    <Box
      component="nav"
      aria-label="Table of contents"
      sx={{
        flex: 'none',
        display: 'flex',
        flexDirection: 'column',
        width: TOC_WIDTH,
        height: '100%',
        bgcolor: 'background.paper',
        color: 'text.primary',
        borderRight: 1,
        borderColor: 'divider',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          pl: 2,
          pr: 1,
          py: 1,
        }}
      >
        <Typography variant="subtitle2" component="h2">
          Contents
        </Typography>
        <IconButton
          size="small"
          aria-label="Close table of contents"
          onClick={onClose}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
      <List dense sx={{ flex: 1, overflowY: 'auto', pt: 0 }}>
        {renderEntries({ entries: toc, level: 0, current, goTo })}
      </List>
    </Box>
  );
}
