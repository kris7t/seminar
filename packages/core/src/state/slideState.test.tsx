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
import { Slide } from '../slide/Slide.tsx';
import { StepStore } from '../steps/StepStore.ts';
import { SlideStateScope } from './SlideStateScope.tsx';
import { SlideStateStore } from './SlideStateStore.ts';
import { useSlideState } from './useSlideState.ts';

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
