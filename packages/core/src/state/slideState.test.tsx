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

function Counter({ name, stateKey }: { name: string; stateKey?: string }) {
  const [count, setCount] = useSlideState(0, { key: stateKey });
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
          <ResetButton />
          <Changed />
          <Step>Later</Step>
        </Slide>
      </Deck>,
    );
    await user.click(screen.getByRole('button', { name: 'A: 0' }));
    await user.keyboard('{ArrowRight}');
    expect(screen.getByText('Changed')).toBeDefined();
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.getByRole('button', { name: 'A: 0' })).toBeDefined();
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

  it('shares state between the views of a slide', async () => {
    const user = userEvent.setup();
    render(
      <Deck defaultMouseNavigation={false}>
        <Slide title="First">
          <Counter name="a" />
          <Counter name="b" />
        </Slide>
        <Slide title="Second" />
      </Deck>,
    );
    await user.click(screen.getByText('b: 0'));
    await user.click(screen.getByText('b: 1'));
    await user.keyboard('o');
    expect(within(overview()).getByText('a: 0')).toBeDefined();
    expect(within(overview()).getByText('b: 2')).toBeDefined();
  });

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
    expect(within(overview()).getByText('left: 0')).toBeDefined();
    expect(within(overview()).getByText('right: 1')).toBeDefined();
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
