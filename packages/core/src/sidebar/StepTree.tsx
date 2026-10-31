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
  for (let depth = 0; depth < path.length; depth += 1) {
    const step = path[depth] ?? 0;
    const position = current[depth] ?? 0;
    if (step !== position) {
      return step < position ? 'past' : 'future';
    }
  }
  return path.length === current.length ? 'current' : 'open';
}

/**
 * Returns where the start of the slide or a step at `path` is, which only
 * encloses the steps nested in its step 0.
 */
function startPhaseOf(path: StepPath, current: StepPath): EntryPhase {
  const phase = phaseOf(path, current);
  return phase === 'open' && (current[path.length] ?? 0) !== 0 ? 'past' : phase;
}

interface EntryProps {
  path: StepPath;
  label: string;
  /** The text to show if the label is empty. */
  fallback: string;
  phase: EntryPhase;
  /** How many levels to indent the entry. */
  level: number;
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
  phase,
  level,
  store,
  lang,
  page,
  overlay,
}: EntryProps): JSX.Element {
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

/**
 * Renders the steps nested in `parent`. Steps nested in step 0 are indented
 * below a start entry if they have to be told apart from the other steps, and
 * are like the other steps if there are none. The start of the slide always has
 * an entry, so only steps get one here.
 */
function renderEntries(
  entries: readonly StepTreeEntry[],
  parent: StepPath,
  level: number,
  current: StepPath,
  store: StepStore,
  t: Translate,
  lang: string | undefined,
  pages: ReadonlySet<string>,
): JSX.Element[] {
  if (entries.length === 0) {
    return [];
  }
  const initial = entries.filter(({ path }) => path.length > parent.length + 1);
  const later = entries.filter(({ path }) => path.length === parent.length + 1);
  const indent = initial.length > 0 && later.length > 0;
  // The enclosing step has the current entry instead of its start.
  const startPhase = startPhaseOf(parent, current);
  return [
    ...(indent && parent.length > 0
      ? [
          <Entry
            key={`start:${parent.join('.')}`}
            path={parent}
            label=""
            fallback={t('startOfStep')}
            phase={startPhase === 'current' ? 'past' : startPhase}
            level={level}
            store={store}
            lang={lang}
            page={false}
            overlay={false}
          />,
        ]
      : []),
    ...renderEntries(
      initial,
      [...parent, 0],
      indent ? level + 1 : level,
      current,
      store,
      t,
      lang,
      pages,
    ),
    ...later.flatMap(({ path, label, overlay, children }) => [
      <Entry
        key={path.join('.')}
        path={path}
        label={label}
        fallback={t('step', { number: path.at(-1) ?? 0 })}
        phase={phaseOf(path, current)}
        level={level}
        store={store}
        lang={lang}
        page={pages.has(path.join('.'))}
        overlay={overlay}
      />,
      ...renderEntries(
        children,
        path,
        level + 1,
        current,
        store,
        t,
        lang,
        pages,
      ),
    ]),
  ];
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
 * Steps nested in the initial content of the slide or a step are indented below
 * a start entry if the slide or step has other steps.
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
        phase={startPhaseOf([], current)}
        level={0}
        store={store}
        lang={lang}
        page={pages.has('')}
        overlay={false}
      />
      {renderEntries(tree, [], 0, current, store, t, lang, pages)}
    </List>
  );
}
