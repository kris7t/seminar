import {
  Box,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  listItemTextClasses,
  Tooltip,
  type ListItemTextProps,
} from '@mui/material';
import { useRef, useState, type JSX } from 'react';

import { useDeck } from '../deck/DeckContext.ts';
import type { Translate } from '../i18n/messages.ts';
import { useT } from '../i18n/UiLanguageContext.ts';
import { scrollIntoView } from './Sidebar.tsx';
import { RecapIcon } from '../icons/RecapIcon.tsx';
import { RecappedIcon } from '../icons/RecappedIcon.tsx';
import { SpareIcon } from '../icons/SpareIcon.tsx';
import { StateIcon } from '../icons/StateIcon.tsx';
import { StepsIcon } from '../icons/StepsIcon.tsx';
import {
  findCurrentEntry,
  type ResolvedTocEntry,
} from '../deck/tableOfContents.ts';

interface RenderEntriesOptions {
  entries: readonly ResolvedTocEntry[];
  level: number;
  current: number | undefined;
  spares: readonly boolean[];
  recapOf: readonly (number | undefined)[];
  hasSteps: readonly boolean[];
  hasState: readonly boolean[];
  stateChanged: readonly boolean[];
  goTo: (slideIndex: number) => void;
  /** Goes to a slide, if it isn't the current one, and shows its steps. */
  showSteps: (slideIndex: number) => void;
  resetSlide: (slideIndex: number) => void;
  t: Translate;
  /** The language of the deck, and of each slide, for their titles. */
  lang: string | undefined;
  slideLangs: readonly (string | undefined)[];
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

/**
 * The title of an entry, on one line, which shows in full in a tooltip next
 * to the table of contents when it's cut off. The tooltip is beside the whole
 * entry, so that it doesn't cover the buttons of the entry.
 */
function EntryTitle({
  children,
  lang,
  ...other
}: ListItemTextProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <Tooltip
      title={<span lang={lang}>{children}</span>}
      placement="right"
      open={open}
      onOpen={() => {
        const primary = ref.current?.querySelector(
          `.${listItemTextClasses.primary}`,
        );
        if (
          primary !== null &&
          primary !== undefined &&
          primary.scrollWidth > primary.clientWidth
        ) {
          setOpen(true);
        }
      }}
      onClose={() => {
        setOpen(false);
      }}
      // The title is in the entry already.
      describeChild
      slotProps={{
        popper: {
          anchorEl: () =>
            ref.current?.closest('li') ?? (ref.current as HTMLElement),
        },
      }}
    >
      <ListItemText ref={ref} lang={lang} {...other}>
        {children}
      </ListItemText>
    </Tooltip>
  );
}

function renderEntries({
  entries,
  level,
  current,
  spares,
  recapOf,
  hasSteps,
  hasState,
  stateChanged,
  goTo,
  showSteps,
  resetSlide,
  t,
  lang,
  slideLangs,
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
            label: t('goToRecappedSlide'),
            Icon: RecapIcon,
          }
        : firstRecap >= 0
          ? {
              target: firstRecap,
              label: t('goToFirstRecap'),
              Icon: RecappedIcon,
            }
          : undefined;
    const steps = entry.hasSlide && hasSteps[entry.slideIndex] === true;
    const state = entry.hasSlide && hasState[entry.slideIndex] === true;
    const changed = state && stateChanged[entry.slideIndex] === true;
    const buttons =
      (link === undefined ? 0 : 1) + (state ? 1 : 0) + (steps ? 1 : 0);
    return [
      <ListItem
        key={`entry-${String(entry.slideIndex)}-${String(entry.hasSlide)}`}
        disablePadding
        sx={[
          // Without the space below inline content, so that the buttons are
          // centered on the entry.
          { '& .MuiListItemSecondaryAction-root': { display: 'flex' } },
          // Room for the buttons next to the entry.
          buttons > 1 && {
            '& > .MuiListItemButton-root': { pr: 1 + buttons * 4 },
          },
        ]}
        secondaryAction={
          buttons === 0 ? undefined : (
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              {/* Steps on the edge, so that their buttons line up. */}
              {link !== undefined && (
                <IconButton
                  edge={steps || state ? false : 'end'}
                  size="small"
                  aria-label={link.label}
                  onClick={() => {
                    goTo(link.target);
                  }}
                >
                  <link.Icon titleAccess={link.label} />
                </IconButton>
              )}
              {state &&
                (changed ? (
                  <IconButton
                    edge={steps ? false : 'end'}
                    size="small"
                    aria-label={t('resetSlide')}
                    onClick={() => {
                      resetSlide(entry.slideIndex);
                    }}
                  >
                    <StateIcon changed titleAccess={t('resetSlide')} />
                  </IconButton>
                ) : (
                  // Only a mark, in the place of the button, which shows its
                  // label as a tooltip, and goes to the slide like the entry.
                  <Box
                    onClick={() => {
                      goTo(entry.slideIndex);
                    }}
                    sx={{
                      display: 'flex',
                      p: '5px',
                      mr: steps ? 0 : '-3px',
                      color: 'action.active',
                      cursor: 'pointer',
                    }}
                  >
                    <StateIcon changed={false} />
                  </Box>
                ))}
              {steps && (
                <IconButton
                  edge="end"
                  size="small"
                  aria-label={t('showSteps')}
                  onClick={() => {
                    showSteps(entry.slideIndex);
                  }}
                >
                  <StepsIcon titleAccess={t('showSteps')} />
                </IconButton>
              )}
            </Box>
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
          <EntryTitle
            // The titles of slides are in the language of the slide, unless
            // they stand in for one, like `Slide 3`.
            lang={
              entry.standIn === true
                ? undefined
                : entry.hasSlide
                  ? slideLangs[entry.slideIndex]
                  : lang
            }
            slotProps={{
              primary: {
                variant: 'body2',
                noWrap: true,
                sx: [
                  level === 0 && { fontWeight: 500 },
                  spare && { color: 'text.secondary' },
                ],
              },
            }}
          >
            {entry.title}
          </EntryTitle>
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
        hasSteps,
        hasState,
        stateChanged,
        goTo,
        showSteps,
        resetSlide,
        t,
        lang,
        slideLangs,
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
  const {
    toc,
    slideIndex,
    spares,
    recapOf,
    hasSteps,
    hasState,
    stateChanged,
    goTo,
    setShowSteps,
    resetSlide,
    lang,
    slideLangs,
  } = useDeck();
  const t = useT();
  const showSteps = (index: number) => {
    if (index !== slideIndex) {
      goTo(index);
    }
    setShowSteps(true);
  };
  const current = findCurrentEntry(toc, slideIndex);
  return (
    <List
      component="nav"
      aria-label={t('tableOfContents')}
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
        hasSteps,
        hasState,
        stateChanged,
        goTo,
        showSteps,
        resetSlide,
        t,
        lang,
        slideLangs,
      })}
    </List>
  );
}
