import { List, ListItemButton, ListItemText } from '@mui/material';
import type { JSX } from 'react';

import { useDeck } from '../deck/DeckContext.ts';
import { scrollIntoView } from '../sidebar/Sidebar.tsx';
import { findCurrentEntry, type ResolvedTocEntry } from './tableOfContents.ts';

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
      ref={entry.slideIndex === current ? scrollIntoView : undefined}
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

/**
 * The table of contents of the deck, which highlights the entry of the current
 * slide and goes to the slide of an entry when clicked.
 *
 * Should be rendered with the {@link uiTheme}.
 */
export function TocList(): JSX.Element {
  const { toc, slideIndex, goTo } = useDeck();
  const current = findCurrentEntry(toc, slideIndex);
  return (
    <List
      component="nav"
      aria-label="Table of contents"
      dense
      // Keep the focus where it is, so that keys like Space keep navigating.
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      sx={{ pt: 0 }}
    >
      {renderEntries({ entries: toc, level: 0, current, goTo })}
    </List>
  );
}
