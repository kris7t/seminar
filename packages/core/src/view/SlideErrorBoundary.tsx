import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlined';
import { Box, Button } from '@mui/material';
import {
  Component,
  use,
  useCallback,
  useSyncExternalStore,
  type JSX,
  type ReactNode,
} from 'react';

import { DeckContext } from '../deck/DeckContext.ts';
import { useT } from '../i18n/UiLanguageContext.ts';
import type { StateOwner, StateStore } from '../state/StateStore.ts';
import { StateStoresContext } from '../state/StateStoresContext.ts';
import type { SlideView } from './SlideViewContext.ts';

/** Attribute that marks the error shown in place of a slide. */
export const SLIDE_ERROR_ATTRIBUTE = 'data-seminar-slide-error';

/**
 * Global that counts the hot updates of the dev server, set by the code that
 * `@seminar/vite-plugin` adds to decks.
 */
const HOT_UPDATES = Symbol.for('seminar.hotUpdates');

/** The last hot update after which the state of each slide was reset. */
const resetsAfterHotUpdates = new WeakMap<
  StateStore,
  Map<StateOwner, number>
>();

/**
 * Whether the slide failed for the first time since a hot update, which may
 * have changed what its components expect of its state.
 */
function isFirstFailureAfterHotUpdate(
  store: StateStore,
  owner: StateOwner,
): boolean {
  const updates = (globalThis as Record<symbol, number | undefined>)[
    HOT_UPDATES
  ];
  if (updates === undefined) return false;
  let resets = resetsAfterHotUpdates.get(store);
  if (resets === undefined) {
    resets = new Map();
    resetsAfterHotUpdates.set(store, resets);
  }
  if (resets.get(owner) === updates) return false;
  resets.set(owner, updates);
  return true;
}

/** Without a deck, there is no state to reset. */
function subscribeToNothing(): () => void {
  return () => undefined;
}

/** Shows what went wrong in place of a slide. */
function SlideError({
  error,
  showStack,
  onReset,
}: {
  error: unknown;
  showStack: boolean;
  onReset: (() => void) | undefined;
}): JSX.Element {
  const t = useT();
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  return (
    <Box
      role="alert"
      {...{ [SLIDE_ERROR_ATTRIBUTE]: '' }}
      sx={{
        position: 'absolute',
        inset: 0,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 2,
        p: 6,
        overflow: 'auto',
        bgcolor: 'background.default',
        color: 'text.primary',
        fontFamily: 'sans-serif',
        fontSize: 24,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          color: 'error.main',
          fontSize: 32,
          fontWeight: 'bold',
        }}
      >
        <ErrorOutlineIcon fontSize="inherit" />
        {t('slideError')}
      </Box>
      <Box sx={{ overflowWrap: 'anywhere' }}>{message}</Box>
      {onReset !== undefined && (
        <Button variant="outlined" onClick={onReset}>
          {t('resetSlide')}
        </Button>
      )}
      {showStack && stack !== undefined && (
        <Box
          component="pre"
          sx={{ m: 0, fontSize: 16, whiteSpace: 'pre-wrap', opacity: 0.7 }}
        >
          {stack}
        </Box>
      )}
    </Box>
  );
}

interface BoundaryProps {
  /** Changes when the state of the slide is reset, which renders it again. */
  resets: number;
  onCatch: () => void;
  showStack: boolean;
  onReset: (() => void) | undefined;
  children?: ReactNode;
}

interface BoundaryState {
  failed: boolean;
  error: unknown;
  resets: number;
}

class Boundary extends Component<BoundaryProps, BoundaryState> {
  override state: BoundaryState = {
    failed: false,
    error: undefined,
    resets: this.props.resets,
  };

  static getDerivedStateFromError(error: unknown): Partial<BoundaryState> {
    return { failed: true, error };
  }

  static getDerivedStateFromProps(
    { resets }: BoundaryProps,
    state: BoundaryState,
  ): Partial<BoundaryState> | null {
    return resets === state.resets
      ? null
      : { failed: false, error: undefined, resets };
  }

  override componentDidCatch(): void {
    this.props.onCatch();
  }

  override render(): ReactNode {
    const { showStack, onReset, children } = this.props;
    return this.state.failed ? (
      <SlideError
        error={this.state.error}
        showStack={showStack}
        onReset={onReset}
      />
    ) : (
      children
    );
  }
}

/**
 * Shows the error of a slide that fails to render instead of it, so that the
 * rest of the deck keeps working. The audience window leaves out the stack
 * trace, and only the view that the presenter interacts with can reset it.
 *
 * It renders the slide again when it is remounted, e.g., when the slide is
 * shown again, or by React Fast Refresh, and when the state of the slide is
 * reset, which every view of it follows. The state is also reset by itself if
 * the slide fails after a hot update, since it may no longer fit the code.
 */
export function SlideErrorBoundary({
  view,
  children,
}: {
  view: SlideView;
  children?: ReactNode;
}): JSX.Element {
  const stores = use(StateStoresContext);
  const deck = use(DeckContext);
  const owner = deck?.recapOf[view.index] ?? view.index;
  const resets = useSyncExternalStore(
    stores?.slides.subscribeResets ?? subscribeToNothing,
    () => stores?.slides.getResets(owner) ?? 0,
  );
  const reset = useCallback(() => {
    stores?.transient.reset(view.index);
    stores?.slides.reset(owner);
  }, [stores, owner, view.index]);
  const onCatch = useCallback(() => {
    if (
      stores !== undefined &&
      isFirstFailureAfterHotUpdate(stores.slides, owner)
    )
      reset();
  }, [stores, owner, reset]);
  // The step may be what fails, so it goes back to the first step, too. A hot
  // update keeps the step, so that it shows what is being edited.
  const onReset = useCallback(() => {
    if (deck === undefined) {
      reset();
    } else {
      deck.resetSlide(view.index);
    }
  }, [deck, view.index, reset]);
  return (
    <Boundary
      resets={resets}
      onCatch={onCatch}
      showStack={view.kind !== 'audience' || view.interactive}
      onReset={view.interactive && stores !== undefined ? onReset : undefined}
    >
      {children}
    </Boundary>
  );
}
