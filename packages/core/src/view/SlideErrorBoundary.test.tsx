import { act, cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { use, useSyncExternalStore, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Deck } from '../deck/Deck.tsx';
import { Slide } from '../slide/Slide.tsx';
import {
  createStateStores,
  StateStoresContext,
} from '../state/StateStoresContext.ts';
import { useSlideState } from '../state/useSlideState.ts';
import { Step } from '../steps/Step.tsx';
import { StepStoreContext } from '../steps/StepStoreContext.ts';
import { SlideViewProvider } from './SlideViewProvider.tsx';
import type { SlideView, SlideViewKind } from './SlideViewContext.ts';

let broken = true;

function Broken(): string {
  if (broken) throw new Error('Slide is broken');
  return 'Slide is fixed';
}

describe('SlideErrorBoundary', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '#');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    broken = true;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    delete (document as Partial<Document>).startViewTransition;
  });

  it('shows the error of a slide, and the rest of the deck keeps working', async () => {
    const user = userEvent.setup();
    render(
      <Deck>
        <Slide title="First">
          <Broken />
        </Slide>
        <Slide title="Second">Works</Slide>
      </Deck>,
    );
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain("This slide can't be shown");
    expect(alert.textContent).toContain('Slide is broken');
    await user.keyboard('{PageDown}');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Works')).toBeDefined();
  });

  function Stateful({ requireFresh }: { requireFresh: boolean }) {
    const [value, setValue] = useSlideState('fresh');
    if (requireFresh && value !== 'fresh') throw new Error('Stale state');
    return (
      <button
        type="button"
        onClick={() => {
          setValue('stale');
        }}
      >
        {value}
      </button>
    );
  }

  function renderView(view: Partial<SlideView>, children: ReactNode) {
    return (
      <SlideViewProvider
        view={{ index: 0, kind: 'audience', interactive: true, ...view }}
      >
        {children}
      </SlideViewProvider>
    );
  }

  it('resets the state of the slide in every view with its button', async () => {
    const user = userEvent.setup();
    const stores = createStateStores();
    const tree = (requireFresh: boolean) => (
      <StateStoresContext value={stores}>
        {renderView({}, <Stateful requireFresh={requireFresh} />)}
        {renderView(
          { kind: 'preview', interactive: false },
          <Stateful requireFresh={requireFresh} />,
        )}
      </StateStoresContext>
    );
    const { rerender } = render(tree(false));
    const [fresh] = screen.getAllByRole('button', { name: 'fresh' });
    await user.click(fresh ?? document.body);
    rerender(tree(true));
    expect(screen.getAllByRole('alert')).toHaveLength(2);
    // Only the view that the presenter interacts with has the button.
    await user.click(screen.getByRole('button', { name: 'Reset slide' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'fresh' })).toHaveLength(2);
  });

  it('shows the error again if the slide still fails after a reset', async () => {
    const user = userEvent.setup();
    render(renderView({}, <Broken />));
    await user.click(screen.getByRole('button', { name: 'Reset slide' }));
    expect(screen.getByRole('alert').textContent).toContain('Slide is broken');
    broken = false;
    await user.click(screen.getByRole('button', { name: 'Reset slide' }));
    expect(screen.getByText('Slide is fixed')).toBeDefined();
  });

  it('renders the slide again when its state is reset elsewhere', () => {
    const stores = createStateStores();
    render(
      <StateStoresContext value={stores}>
        {renderView({ index: 1 }, <Broken />)}
      </StateStoresContext>,
    );
    broken = false;
    act(() => {
      stores.slides.reset(0);
    });
    expect(screen.getByRole('alert')).toBeDefined();
    act(() => {
      stores.slides.reset(1);
    });
    expect(screen.getByText('Slide is fixed')).toBeDefined();
  });

  it('hides the stack trace in the audience window', () => {
    render(renderView({ interactive: false }, <Broken />));
    expect(screen.getByRole('alert').textContent).toContain('Slide is broken');
    expect(screen.getByRole('alert').querySelector('pre')).toBeNull();
  });

  it.each<Partial<SlideView>>([
    { kind: 'audience', interactive: true },
    { kind: 'presenter', interactive: true },
    { kind: 'preview', interactive: false },
  ])('shows the stack trace in other views (%j)', (view) => {
    render(renderView(view, <Broken />));
    expect(screen.getByRole('alert').querySelector('pre')).not.toBeNull();
  });

  it('goes back to the first step, in case a later step fails', async () => {
    const user = userEvent.setup();
    // A transition applies its changes later, unlike without one in tests.
    Object.assign(document, {
      startViewTransition: (update: () => Promise<void>) => {
        const updated = Promise.resolve().then(update);
        return {
          finished: updated,
          ready: updated,
          updateCallbackDone: updated,
          skipTransition: () => undefined,
        };
      },
    });
    function FailsAfterFirstStep() {
      const store = use(StepStoreContext);
      const path = useSyncExternalStore(store.subscribe, store.getPath);
      if (path.length > 0) throw new Error('Step is broken');
      return <span>First step</span>;
    }
    render(
      <Deck defaultMouseNavigation={false}>
        <Slide title="First">
          <FailsAfterFirstStep />
          <Step>Later</Step>
        </Slide>
      </Deck>,
    );
    await user.keyboard('{ArrowRight}');
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Step is broken',
    );
    await user.click(screen.getByRole('button', { name: 'Reset slide' }));
    await act(() => Promise.resolve());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('First step')).toBeDefined();
    expect(window.location.hash).toBe('#slide=1');
  });

  describe('after a hot update', () => {
    const HOT_UPDATES = Symbol.for('seminar.hotUpdates');
    const globals = globalThis as Record<symbol, number | undefined>;

    afterEach(() => {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete globals[HOT_UPDATES];
    });

    async function renderStale() {
      const user = userEvent.setup();
      const stores = createStateStores();
      const tree = (requireFresh: boolean) => (
        <StateStoresContext value={stores}>
          {renderView({}, <Stateful requireFresh={requireFresh} />)}
        </StateStoresContext>
      );
      const { rerender } = render(tree(false));
      await user.click(screen.getByRole('button', { name: 'fresh' }));
      return () => {
        rerender(tree(true));
      };
    }

    it('resets the state of a slide that fails', async () => {
      const update = await renderStale();
      globals[HOT_UPDATES] = 1;
      update();
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.getByRole('button', { name: 'fresh' })).toBeDefined();
    });

    it('shows the error if the slide fails even after the reset', () => {
      globals[HOT_UPDATES] = 1;
      render(renderView({}, <Broken />));
      expect(screen.getByRole('alert').textContent).toContain(
        'Slide is broken',
      );
    });

    it('resets once for each update', async () => {
      const update = await renderStale();
      globals[HOT_UPDATES] = 1;
      update();
      await userEvent
        .setup()
        .click(screen.getByRole('button', { name: 'fresh' }));
      expect(screen.getByRole('alert').textContent).toContain('Stale state');
    });

    it('keeps the state without an update', async () => {
      const update = await renderStale();
      update();
      expect(screen.getByRole('alert').textContent).toContain('Stale state');
    });
  });

  it('renders the slide again when it is shown again', async () => {
    const user = userEvent.setup();
    render(
      <Deck>
        <Slide title="First">
          <Broken />
        </Slide>
        <Slide title="Second" />
      </Deck>,
    );
    await user.keyboard('{PageDown}');
    broken = false;
    await user.keyboard('{PageUp}');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Slide is fixed')).toBeDefined();
  });

  it('shows values thrown other than errors', () => {
    function Throws(): null {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'Just a string';
    }
    render(
      <SlideViewProvider
        view={{ index: 0, kind: 'audience', interactive: true }}
      >
        <Throws />
      </SlideViewProvider>,
    );
    expect(screen.getByRole('alert').textContent).toContain('Just a string');
  });

  it.each<SlideViewKind>(['thumbnail', 'probe', 'print', 'document'])(
    'leaves errors in %s views to the code that renders them',
    (kind) => {
      expect(() =>
        render(
          <SlideViewProvider view={{ index: 0, kind, interactive: false }}>
            <Broken />
          </SlideViewProvider>,
        ),
      ).toThrow('Slide is broken');
    },
  );
});
