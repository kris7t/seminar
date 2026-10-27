import { List, ListItemButton, ListItemText, Typography } from '@mui/material';
import { useMemo, useSyncExternalStore, type JSX } from 'react';

import { useDeck } from '../deck/DeckContext.ts';
import { OverlayIcon } from '../icons/OverlayIcon.tsx';
import { SplitPageIcon } from '../icons/SplitPageIcon.tsx';
import type { Translate } from '../i18n/messages.ts';
import { useT } from '../i18n/UiLanguageContext.ts';
import { scrollIntoView } from './Sidebar.tsx';
import type { StepPath, StepStore, StepTreeEntry } from '../steps/StepStore.ts';

/** Where a step is relative to the current one. */
type EntryPhase = 'past' | 'open' | 'current' | 'future';

function phaseOf(path: StepPath, current: StepPath): EntryPhase {
  // The start of the slide doesn't enclose the steps of the slide.
  if (path.length === 0) {
    return current.length === 0 ? 'current' : 'past';
  }
  for (let depth = 0; depth < path.length; depth += 1) {
    const step = path[depth] ?? 0;
    const position = current[depth] ?? 0;
    if (step !== position) {
      return step < position ? 'past' : 'future';
    }
  }
  return path.length === current.length ? 'current' : 'open';
}

interface EntryProps {
  path: StepPath;
  label: string;
  /** The text to show if the label is empty. */
  fallback: string;
  level: number;
  current: StepPath;
  store: StepStore;
  /** The language of the labels, which are taken from the slide. */
  lang: string | undefined;
  /** Whether the step becomes a page when the slide is split into pages. */
  page: boolean;
  /** Whether the step may cover other content. */
  overlay: boolean;
}

function Entry({
  path,
  label,
  fallback,
  level,
  current,
  store,
  lang,
  page,
  overlay,
}: EntryProps): JSX.Element {
  const phase = phaseOf(path, current);
  // Going through the slide skips steps outside its range, but they can still
  // be chosen here.
  const skipped = !store.isInRange(path);
  return (
    <ListItemButton
      selected={phase === 'current'}
      aria-current={phase === 'current' ? 'step' : undefined}
      ref={phase === 'current' ? scrollIntoView : undefined}
      onClick={() => {
        store.reset(path);
      }}
      sx={{ pl: 2 + level * 2 }}
    >
      <ListItemText
        // Placeholders are in the language of the user interface.
        lang={label === '' ? undefined : lang}
        slotProps={{
          primary: {
            variant: 'body2',
            noWrap: true,
            sx: [
              phase === 'open' && { fontWeight: 500 },
              phase === 'future' && { color: 'text.secondary' },
              label === '' && { fontStyle: 'italic' },
              skipped && {
                color: 'text.disabled',
                textDecoration: 'line-through',
              },
            ],
          },
        }}
      >
        {label === '' ? fallback : label}
      </ListItemText>
      {overlay && <OverlayIcon sx={{ ml: 1, color: 'text.secondary' }} />}
      {page && <SplitPageIcon sx={{ ml: 1, color: 'text.secondary' }} />}
    </ListItemButton>
  );
}

function renderEntries(
  entries: readonly StepTreeEntry[],
  level: number,
  current: StepPath,
  store: StepStore,
  t: Translate,
  lang: string | undefined,
  pages: ReadonlySet<string>,
): JSX.Element[] {
  return entries.flatMap(({ path, label, overlay, children }) => [
    <Entry
      key={path.join('.')}
      path={path}
      label={label}
      fallback={t('step', { number: path.at(-1) ?? 0 })}
      level={level}
      current={current}
      store={store}
      lang={lang}
      page={pages.has(path.join('.'))}
      overlay={overlay}
    />,
    ...renderEntries(children, level + 1, current, store, t, lang, pages),
  ]);
}

export interface StepTreeProps {
  /** The steps of the current slide. */
  store: StepStore;
}

/**
 * The steps of the current slide as a tree, labeled with the text they show,
 * which highlights the current step, and goes to a step when clicked.
 *
 * The first entry goes to the beginning of the slide, before any of its steps.
 * Steps outside the range of the slide (see `StepRange`), which going through
 * the slide skips, are struck through. Icons mark the steps that become pages
 * when the slide is split into pages, and the steps that may cover other
 * content.
 *
 * Should be rendered with the {@link uiTheme}.
 */
export function StepTree({ store }: StepTreeProps): JSX.Element {
  const t = useT();
  const { slideIndex, slideLangs } = useDeck();
  const lang = slideLangs[slideIndex];
  const tree = useSyncExternalStore(store.subscribe, store.getTree);
  const current = useSyncExternalStore(store.subscribe, store.getPath);
  // Re-renders the entries when the range changes.
  useSyncExternalStore(store.subscribe, store.getRange);
  const splitPaths = useSyncExternalStore(store.subscribe, store.getSplitPaths);
  const pages = useMemo(
    () => new Set(splitPaths.map((path) => path.join('.'))),
    [splitPaths],
  );
  if (tree.length === 0) {
    return (
      <Typography
        variant="body2"
        sx={{ px: 2, py: 1, color: 'text.secondary' }}
      >
        {t('noSteps')}
      </Typography>
    );
  }
  return (
    <List
      component="nav"
      aria-label={t('steps')}
      dense
      // Keep the focus where it is, so that keys like Space keep navigating.
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      sx={{ pt: 0 }}
    >
      <Entry
        path={[]}
        label=""
        fallback={t('startOfSlide')}
        level={0}
        current={current}
        store={store}
        lang={lang}
        page={pages.has('')}
        overlay={false}
      />
      {renderEntries(tree, 0, current, store, t, lang, pages)}
    </List>
  );
}
