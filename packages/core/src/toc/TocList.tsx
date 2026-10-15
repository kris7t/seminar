import {
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
} from '@mui/material';
import type { JSX } from 'react';

import { useDeck } from '../deck/DeckContext.ts';
import { scrollIntoView } from '../sidebar/Sidebar.tsx';
import { RecapIcon } from '../slide/RecapIcon.tsx';
import { RecappedIcon } from '../slide/RecappedIcon.tsx';
import { SpareIcon } from '../slide/SpareIcon.tsx';
import { findCurrentEntry, type ResolvedTocEntry } from './tableOfContents.ts';

interface RenderEntriesOptions {
  entries: readonly ResolvedTocEntry[];
  level: number;
  current: number | undefined;
  spares: readonly boolean[];
  recapOf: readonly (number | undefined)[];
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
  recapOf,
  goTo,
}: RenderEntriesOptions): JSX.Element[] {
  return entries.flatMap((entry) => {
    const isCurrent = entry.hasSlide && entry.slideIndex === current;
    const spare = isSpareEntry(entry, spares);
    // Recaps link to the slide they recap, and recapped slides to their first
    // recap.
    const original = entry.hasSlide ? recapOf[entry.slideIndex] : undefined;
    const firstRecap =
      entry.hasSlide && original === undefined
        ? recapOf.indexOf(entry.slideIndex)
        : -1;
    const link =
      original !== undefined
        ? {
            target: original,
            label: 'Go to the recapped slide',
            Icon: RecapIcon,
          }
        : firstRecap >= 0
          ? {
              target: firstRecap,
              label: 'Go to the first recap',
              Icon: RecappedIcon,
            }
          : undefined;
    return [
      <ListItem
        key={`entry-${String(entry.slideIndex)}-${String(entry.hasSlide)}`}
        disablePadding
        // Without the space below inline content, so that the button is
        // centered on the entry.
        sx={{ '& .MuiListItemSecondaryAction-root': { display: 'flex' } }}
        secondaryAction={
          link === undefined ? undefined : (
            <IconButton
              edge="end"
              size="small"
              aria-label={link.label}
              onClick={() => {
                goTo(link.target);
              }}
            >
              <link.Icon titleAccess={link.label} />
            </IconButton>
          )
        }
      >
        <ListItemButton
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
        </ListItemButton>
      </ListItem>,
      ...renderEntries({
        entries: entry.children,
        level: level + 1,
        current,
        spares,
        recapOf,
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
  const { toc, slideIndex, spares, recapOf, goTo } = useDeck();
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
      {renderEntries({
        entries: toc,
        level: 0,
        current,
        spares,
        recapOf,
        goTo,
      })}
    </List>
  );
}
