import { List, ListItemButton, ListItemText } from '@mui/material';
import type { JSX } from 'react';

import { useDeck } from '../deck/DeckContext.ts';
import { scrollIntoView } from '../sidebar/Sidebar.tsx';
import { SpareIcon } from '../slide/SpareIcon.tsx';
import { findCurrentEntry, type ResolvedTocEntry } from './tableOfContents.ts';

interface RenderEntriesOptions {
  entries: readonly ResolvedTocEntry[];
  level: number;
  current: number | undefined;
  spares: readonly boolean[];
  goTo: (slideIndex: number) => void;
}

/**
 * Whether the slide of `entry` is spare, or if it has no slide, whether all
 * the slides nested in it are.
 */
function isSpareEntry(
  entry: ResolvedTocEntry,
  spares: readonly boolean[],
): boolean {
  return entry.hasSlide
    ? spares[entry.slideIndex] === true
    : entry.children.every((child) => isSpareEntry(child, spares));
}

function renderEntries({
  entries,
  level,
  current,
  spares,
  goTo,
}: RenderEntriesOptions): JSX.Element[] {
  return entries.flatMap((entry) => {
    const isCurrent = entry.hasSlide && entry.slideIndex === current;
    const spare = isSpareEntry(entry, spares);
    return [
      <ListItemButton
        key={`entry-${String(entry.slideIndex)}-${String(entry.hasSlide)}`}
        selected={isCurrent}
        aria-current={isCurrent ? 'page' : undefined}
        ref={isCurrent ? scrollIntoView : undefined}
        onClick={() => {
          goTo(entry.slideIndex);
        }}
        sx={{ pl: 2 + level * 2 }}
      >
        <ListItemText
          slotProps={{
            primary: {
              variant: 'body2',
              sx: [
                level === 0 && { fontWeight: 500 },
                spare && { color: 'text.secondary' },
              ],
            },
          }}
        >
          {entry.title}
        </ListItemText>
        {/* Spare slides are skipped when going through the deck. */}
        {spare && <SpareIcon sx={{ ml: 1, color: 'text.secondary' }} />}
      </ListItemButton>,
      ...renderEntries({
        entries: entry.children,
        level: level + 1,
        current,
        spares,
        goTo,
      }),
    ];
  });
}

/**
 * The table of contents of the deck, which highlights the entry of the current
 * slide and goes to the slide of an entry when clicked.
 *
 * Should be rendered with the {@link uiTheme}.
 */
export function TocList(): JSX.Element {
  const { toc, slideIndex, spares, goTo } = useDeck();
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
      {renderEntries({ entries: toc, level: 0, current, spares, goTo })}
    </List>
  );
}
