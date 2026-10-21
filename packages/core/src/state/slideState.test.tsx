import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Deck } from '../deck/Deck.tsx';
import { useDeck } from '../deck/DeckContext.ts';
import { Slide } from '../slide/Slide.tsx';
import { Step } from '../steps/Step.tsx';
import { StepStore } from '../steps/StepStore.ts';
import { SlideStateScope } from './SlideStateScope.tsx';
import { SlideStateStore } from './SlideStateStore.ts';
import { useResetSlideState, useSlideState } from './useSlideState.ts';
import { SlideStateContext } from './SlideStateContext.ts';
import { SlideViewProvider } from '../view/SlideViewProvider.tsx';

function Counter({
  name,
  stateKey,
  transient = false,
}: {
  name: string;
  stateKey?: string;
  transient?: boolean;
}) {
  const [count, setCount] = useSlideState(0, { key: stateKey, transient });
  return (
    <button
      type="button"
      onClick={() => {
        setCount((previous) => previous + 1);
      }}
    >
      {`${name}: ${String(count)}`}
    </button>
  );
}

const overview = () => screen.getByRole('region', { name: 'Slide overview' });

describe('SlideStateStore', () => {
  it('notifies transient state changes without marking the slide or invalidating snapshots', () => {
    const store = new SlideStateStore();
    const changed = vi.fn();
    const invalidated = vi.fn();
    store.subscribeState(invalidated);
    const listener = vi.fn();
    store.subscribeChanged(changed);
    store.subscribe(0, 'mirror', listener);
    store.getOrInit(0, 'mirror', () => 0, true);
    expect(store.hasState(0)).toBe(false);
    store.set(0, 'mirror', 1);
    expect(listener).toHaveBeenCalledOnce();
    expect(changed).not.toHaveBeenCalled();
    expect(store.getChanged().size).toBe(0);
    store.set(0, 'mirror', 1);
    store.reset(0);
    store.resetAll();
    expect(store.get(0, 'mirror')).toBe(1);
    expect(listener).toHaveBeenCalledOnce();
    expect(invalidated).not.toHaveBeenCalled();
  });

  it('resets regular state while retaining transient values and step positions', () => {
    const store = new SlideStateStore();
    store.getOrInit(0, 'mirror', () => 0, true);
    store.getOrInit(1, 'mirror', () => 0, true);
    store.set(0, 'mirror', 1);
    store.set(1, 'mirror', 2);
    store.set(0, 'answer', 3);
    store.set(1, 'answer', 4);
    store.stepPosition(0).set({ path: [1], toEnd: false });
    expect(store.hasState(0)).toBe(true);
    store.reset(0);
    expect(store.get(0, 'answer')).toBeUndefined();
    expect(store.get(0, 'mirror')).toBe(1);
    expect(store.hasState(0)).toBe(false);
    expect([...store.getChanged()]).toEqual([1]);
    store.resetAll();
    expect(store.get(1, 'answer')).toBeUndefined();
    expect(store.get(1, 'mirror')).toBe(2);
    expect(store.hasState(1)).toBe(false);
    expect(store.getChanged().size).toBe(0);
    expect(store.stepPosition(0).get().path).toEqual([1]);
  });

  it('moves transient state with its slide and removes its metadata with removed slides', () => {
    const store = new SlideStateStore();
    const invalidated = vi.fn();
    store.subscribeState(invalidated);
    store.getOrInit(0, 'mirror', () => 'removed', true);
    store.getOrInit(1, 'mirror', () => 'moved', true);
    store.move([undefined, 2]);
    expect(store.has(0, 'mirror')).toBe(false);
    expect(store.has(1, 'mirror')).toBe(false);
    expect(store.get(2, 'mirror')).toBe('moved');
    expect(store.hasState(2)).toBe(false);
    expect(invalidated).not.toHaveBeenCalled();
    store.resetAll();
    expect(store.get(2, 'mirror')).toBe('moved');
    store.getOrInit(0, 'mirror', () => 'regular');
    expect(store.hasState(0)).toBe(true);
    store.set(0, 'mirror', 'changed');
    expect([...store.getChanged()]).toEqual([0]);
  });

  it('preserves transient metadata when equal values move without invalidating snapshots', () => {
    const store = new SlideStateStore();
    const invalidated = vi.fn();
    store.subscribeState(invalidated);
    store.getOrInit(0, 'value', () => 1, true);
    store.getOrInit(1, 'value', () => 1);
    store.move([1, 0]);
    expect(invalidated).not.toHaveBeenCalled();
    expect(store.hasState(0)).toBe(true);
    expect(store.hasState(1)).toBe(false);
    store.resetAll();
    expect(store.has(0, 'value')).toBe(false);
    expect(store.get(1, 'value')).toBe(1);
  });

  it('reports changed slides without counting initialization, unchanged writes, or steps', () => {
    const store = new SlideStateStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribeState(listener);
    store.getOrInit(0, 'a', () => 1);
    store.stepPosition(0).set({ path: [1], toEnd: false });
    expect(listener).not.toHaveBeenCalled();
    store.set(0, 'a', 2);
    store.set(0, 'a', 2);
    store.set(0, 'a', 3);
    store.reset(0);
    store.reset(0);
    store.getOrInit(0, 'a', () => 1);
    store.getOrInit(1, 'a', () => 1);
    store.resetAll();
    store.resetAll();
    expect(listener.mock.calls).toEqual([[[0]], [[0]], [[0]], [[0, 1]]]);
    unsubscribe();
    store.set(0, 'a', 4);
    expect(listener).toHaveBeenCalledTimes(4);
  });

  it('reports only slides whose values change when moving state', () => {
    const store = new SlideStateStore();
    store.set(0, 'a', 'first');
    store.set(1, 'a', 'second');
    const listener = vi.fn();
    store.subscribeState(listener);
    store.move([0, 1]);
    expect(listener).not.toHaveBeenCalled();
    store.move([undefined, 2]);
    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0]?.[0]).toEqual([0, 1, 2]);
  });

  it('stores values by slide and key', () => {
    const store = new SlideStateStore();
    const listener = vi.fn();
    store.subscribe(0, 'a', listener);
    expect(store.getOrInit(0, 'a', () => 1)).toBe(1);
    expect(store.getOrInit(0, 'a', () => 2)).toBe(1);
    expect(listener).not.toHaveBeenCalled();
    store.set(0, 'a', 3);
    store.set(1, 'a', 4);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.get(0, 'a')).toBe(3);
    expect(store.get(1, 'a')).toBe(4);
    expect(store.stepPosition(0)).toBe(store.stepPosition(0));
  });

  it('tracks and resets changed state, but not the steps', () => {
    const store = new SlideStateStore();
    const changed = vi.fn();
    store.subscribeChanged(changed);
    store.getOrInit(0, 'a', () => 1);
    store.stepPosition(0).set({ path: [1], toEnd: false });
    // Only initialized, and the steps don't count.
    expect(store.hasState(0)).toBe(true);
    expect(store.hasState(1)).toBe(false);
    expect(store.getChanged().size).toBe(0);
    store.stepPosition(1).set({ path: [1], toEnd: false });
    expect(store.hasState(1)).toBe(false);
    store.set(0, 'a', 2);
    const snapshot = store.getChanged();
    expect([...snapshot]).toEqual([0]);
    store.set(0, 'a', 3);
    expect(store.getChanged()).toBe(snapshot);
    expect(changed).toHaveBeenCalledOnce();
    const listener = vi.fn();
    store.subscribe(0, 'a', listener);
    store.reset(0);
    expect(listener).toHaveBeenCalledOnce();
    expect(store.getChanged().size).toBe(0);
    expect(store.hasState(0)).toBe(false);
    expect(store.getOrInit(0, 'a', () => 1)).toBe(1);
    expect(store.stepPosition(0).get().path).toEqual([1]);
  });

  it('moves the state of slides to other indices', () => {
    const store = new SlideStateStore();
    store.set(0, 'a', 'first');
    store.set(1, 'a', 'second');
    store.stepPosition(1).set({ path: [2], toEnd: false });
    const listener = vi.fn();
    store.subscribe(2, 'a', listener);
    // A slide was added before the second one, and the first was removed.
    store.move([undefined, 2]);
    expect(store.has(0, 'a')).toBe(false);
    expect(store.has(1, 'a')).toBe(false);
    expect(store.get(2, 'a')).toBe('second');
    expect(store.stepPosition(2).get().path).toEqual([2]);
    expect([...store.getChanged()]).toEqual([2]);
    expect(listener).toHaveBeenCalled();
  });

  it('shares the position in the steps between step stores', () => {
    const position = new SlideStateStore().stepPosition(0);
    const a = new StepStore({ position });
    const b = new StepStore({ position });
    const listener = vi.fn();
    b.subscribe(listener);
    a.reset([], true);
    expect(listener).toHaveBeenCalled();
    expect(b.getPath()).toEqual(a.getPath());
  });
});

describe('useSlideState', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '#');
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('keeps transient values without state markers or per-slide reset buttons', async () => {
    const user = userEvent.setup();
    function StateFlags() {
      const { hasState, stateChanged, deckChanged } = useDeck();
      return (
        <output data-testid="flags">
          {JSON.stringify([hasState[0], stateChanged[0], deckChanged])}
        </output>
      );
    }
    render(
      <Deck
        defaultMouseNavigation={false}
        defaultShowToc
        toc={[{ slide: 0 }, { slide: 1 }]}
      >
        <Slide title="First">
          <Counter name="Mirror" transient />
          <StateFlags />
        </Slide>
        <Slide title="Second" />
      </Deck>,
    );
    await user.click(screen.getByRole('button', { name: 'Mirror: 0' }));
    expect(screen.getByTestId('flags').textContent).toBe('[false,false,false]');
    const nav = within(
      screen.getByRole('navigation', { name: 'Table of contents' }),
    );
    expect(nav.queryByRole('img', { name: 'Keeps your changes' })).toBeNull();
    expect(nav.queryByRole('button', { name: 'Reset slide' })).toBeNull();
    await user.pointer({
      keys: '[MouseRight]',
      target: screen.getByRole('heading', { name: 'First' }),
    });
    const menu = within(await screen.findByRole('menu'));
    expect(
      menu
        .getByRole('menuitem', { name: 'Reset slide' })
        .getAttribute('aria-disabled'),
    ).toBe('true');
    expect(
      menu
        .getByRole('menuitem', { name: 'Reset deck' })
        .getAttribute('aria-disabled'),
    ).toBe('true');
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('menu')).toBeNull();
    });
    await user.click(nav.getByRole('button', { name: 'Second' }));
    expect(screen.getByRole('heading', { name: 'Second' })).toBeDefined();
    await user.click(nav.getByRole('button', { name: 'First' }));
    expect(screen.getByRole('button', { name: 'Mirror: 0' })).toBeDefined();
    await user.keyboard('o');
    expect(
      within(overview()).getByRole('button', { name: 'Slide 1: First' }),
    ).toBeDefined();
  });

  it('keeps transient state through steps and the overview, but resets it on the next visit', async () => {
    const user = userEvent.setup();
    render(
      <Deck defaultMouseNavigation={false}>
        <Slide title="First">
          <Counter name="Saved" />
          <Counter name="Mirror" transient />
          <Step>Later</Step>
        </Slide>
        <Slide title="Second" />
      </Deck>,
    );
    await user.click(screen.getByRole('button', { name: 'Saved: 0' }));
    await user.click(screen.getByRole('button', { name: 'Mirror: 0' }));
    await user.keyboard('{ArrowRight}o{Escape}');
    expect(screen.getByRole('button', { name: 'Mirror: 1' })).toBeDefined();
    await user.keyboard('{PageDown}');
    expect(screen.getByRole('heading', { name: 'Second' })).toBeDefined();
    await user.keyboard('{PageUp}');
    expect(screen.getByRole('button', { name: 'Mirror: 0' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Saved: 1' })).toBeDefined();
    expect(window.location.hash).toBe('#slide=1&step=1');
  });

  it('lets slides reset their own state', async () => {
    const user = userEvent.setup();
    function ResetButton() {
      const reset = useResetSlideState();
      return (
        <button type="button" onClick={reset}>
          Reset
        </button>
      );
    }
    function Changed() {
      const { stateChanged } = useDeck();
      return <span>{stateChanged[0] === true ? 'Changed' : 'Unchanged'}</span>;
    }
    render(
      <Deck>
        <Slide title="First">
          <Counter name="A" />
          <Counter name="Mirror" transient />
          <ResetButton />
          <Changed />
          <Step>Later</Step>
        </Slide>
      </Deck>,
    );
    await user.click(screen.getByRole('button', { name: 'A: 0' }));
    await user.click(screen.getByRole('button', { name: 'Mirror: 0' }));
    await user.keyboard('{ArrowRight}');
    expect(screen.getByText('Changed')).toBeDefined();
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.getByRole('button', { name: 'A: 0' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Mirror: 1' })).toBeDefined();
    expect(screen.getByText('Unchanged')).toBeDefined();
    // The steps are kept.
    expect(window.location.hash).toBe('#slide=1&step=1');
  });

  it('resets the state of the slide from the menu', async () => {
    const user = userEvent.setup();
    render(
      <Deck>
        <Slide title="First">
          <Counter name="A" />
          <Step>Later</Step>
        </Slide>
      </Deck>,
    );
    const resetItem = async () => {
      await user.pointer({
        keys: '[MouseRight]',
        target: screen.getByRole('heading'),
      });
      return within(await screen.findByRole('menu')).getByRole('menuitem', {
        name: 'Reset slide',
      });
    };
    // Nothing to reset yet.
    expect((await resetItem()).getAttribute('aria-disabled')).toBe('true');
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'A: 0' }));
    await user.keyboard('{ArrowRight}');
    expect(window.location.hash).toBe('#slide=1&step=1');
    await user.click(await resetItem());
    expect(screen.getByRole('button', { name: 'A: 0' })).toBeDefined();
    expect(window.location.hash).toBe('#slide=1');
  });

  it.each([false, true])(
    'shares state between the views of a slide (transient: %s)',
    async (transient) => {
      const user = userEvent.setup();
      render(
        <SlideStateContext value={new SlideStateStore()}>
          <div data-testid="presented">
            <SlideViewProvider
              view={{ index: 0, kind: 'audience', interactive: true }}
            >
              <Counter name="a" transient={transient} />
              <Counter name="b" transient={transient} />
            </SlideViewProvider>
          </div>
          <div data-testid="mirror">
            <SlideViewProvider
              view={{ index: 0, kind: 'preview', interactive: false }}
            >
              <Counter name="a" transient={transient} />
              <Counter name="b" transient={transient} />
            </SlideViewProvider>
          </div>
        </SlideStateContext>,
      );
      const presented = within(screen.getByTestId('presented'));
      await user.click(presented.getByText('b: 0'));
      await user.click(presented.getByText('b: 1'));
      const mirror = within(screen.getByTestId('mirror'));
      expect(mirror.getByText('a: 0')).toBeDefined();
      expect(mirror.getByText('b: 2')).toBeDefined();
    },
  );

  it('keeps state when going to another slide and back', async () => {
    const user = userEvent.setup();
    render(
      <Deck defaultMouseNavigation={false}>
        <Slide title="First">
          <Counter name="a" />
        </Slide>
        <Slide title="Second">
          <Counter name="a" />
        </Slide>
      </Deck>,
    );
    await user.click(screen.getByText('a: 0'));
    await user.keyboard('{PageDown}');
    // Slides have their own state.
    expect(screen.getByText('a: 0')).toBeDefined();
    await user.keyboard('{PageUp}');
    expect(screen.getByText('a: 1')).toBeDefined();
  });

  it('identifies state by keys and scopes', async () => {
    const user = userEvent.setup();
    function Toggle() {
      const [shown, setShown] = useState(false);
      return shown ? (
        <Counter name="late" stateKey="late" />
      ) : (
        <button
          type="button"
          onClick={() => {
            setShown(true);
          }}
        >
          Show
        </button>
      );
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    render(
      <Deck defaultMouseNavigation={false}>
        <Slide title="First">
          <SlideStateScope id="left">
            <Counter name="left" />
          </SlideStateScope>
          <SlideStateScope id="right">
            <Counter name="right" />
          </SlideStateScope>
          <Toggle />
        </Slide>
      </Deck>,
    );
    await user.click(screen.getByText('right: 0'));
    await user.click(screen.getByText('Show'));
    await user.click(screen.getByText('late: 0'));
    await user.keyboard('o');
    const image = decodeURIComponent(
      overview().querySelector('img')?.src ?? '',
    );
    expect(image).toContain('left: 0');
    expect(image).toContain('right: 1');
    expect(image).toContain('late: 1');
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns about components without keys that mount later', async () => {
    const user = userEvent.setup();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    function Toggle() {
      const [shown, setShown] = useState(false);
      return shown ? (
        <Counter name="late" />
      ) : (
        <button
          type="button"
          onClick={() => {
            setShown(true);
          }}
        >
          Show
        </button>
      );
    }
    render(
      <Deck defaultMouseNavigation={false}>
        <Slide title="First">
          <Toggle />
        </Slide>
      </Deck>,
    );
    await user.click(screen.getByText('Show'));
    await waitFor(() => {
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('without a key'),
      );
    });
  });
});
