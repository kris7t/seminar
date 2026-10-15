import { List, ListItemButton, ListItemText, Typography } from '@mui/material';
import { useSyncExternalStore, type JSX } from 'react';

import { scrollIntoView } from '../sidebar/Sidebar.tsx';
import type { StepPath, StepStore, StepTreeEntry } from './StepStore.ts';

/** Where a step is relative to the current one. */
type EntryPhase = 'past' | 'parent' | 'current' | 'future';

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
  return path.length === current.length ? 'current' : 'parent';
}

interface EntryProps {
  path: StepPath;
  label: string;
  /** The text to show if the label is empty. */
  fallback: string;
  level: number;
  current: StepPath;
  store: StepStore;
}

function Entry({
  path,
  label,
  fallback,
  level,
  current,
  store,
}: EntryProps): JSX.Element {
  const phase = phaseOf(path, current);
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
        slotProps={{
          primary: {
            variant: 'body2',
            noWrap: true,
            sx: [
              phase === 'parent' && { fontWeight: 500 },
              phase === 'future' && { color: 'text.secondary' },
              label === '' && { fontStyle: 'italic' },
            ],
          },
        }}
      >
        {label === '' ? fallback : label}
      </ListItemText>
    </ListItemButton>
  );
}

function renderEntries(
  entries: readonly StepTreeEntry[],
  level: number,
  current: StepPath,
  store: StepStore,
): JSX.Element[] {
  return entries.flatMap(({ path, label, children }) => [
    <Entry
      key={path.join('.')}
      path={path}
      label={label}
      fallback={`Step ${String(path.at(-1))}`}
      level={level}
      current={current}
      store={store}
    />,
    ...renderEntries(children, level + 1, current, store),
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
 *
 * Should be rendered with the {@link uiTheme}.
 */
export function StepTree({ store }: StepTreeProps): JSX.Element {
  const tree = useSyncExternalStore(store.subscribe, store.getTree);
  const current = useSyncExternalStore(store.subscribe, store.getPath);
  if (tree.length === 0) {
    return (
      <Typography
        variant="body2"
        sx={{ px: 2, py: 1, color: 'text.secondary' }}
      >
        This slide has no steps.
      </Typography>
    );
  }
  return (
    <List
      component="nav"
      aria-label="Steps"
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
        fallback="Start of the slide"
        level={0}
        current={current}
        store={store}
      />
      {renderEntries(tree, 0, current, store)}
    </List>
  );
}
