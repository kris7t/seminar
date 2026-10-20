import { cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Deck } from '../deck/Deck.tsx';
import { Slide } from '../slide/Slide.tsx';
import { Step } from '../steps/Step.tsx';
import { DeckStateStore } from './DeckStateStore.ts';
import { useDeckState } from './useDeckState.ts';
import { useSlideState } from './useSlideState.ts';

function Answer({ name }: { name: string }) {
  const [answer, setAnswer] = useDeckState<number>('answer');
  return (
    <button
      type="button"
      onClick={() => {
        setAnswer((previous) => (previous ?? 0) + 1);
      }}
    >
      {`${name}: ${String(answer)}`}
    </button>
  );
}

function Counter() {
  const [count, setCount] = useSlideState(0);
  return (
    <button
      type="button"
      onClick={() => {
        setCount(count + 1);
      }}
    >
      {`Count: ${String(count)}`}
    </button>
  );
}

describe('DeckStateStore', () => {
  it('advances its generation for every state change and nonempty reset', () => {
    const store = new DeckStateStore();
    expect(store.getGeneration()).toBe(0);
    store.set('a', 1);
    expect(store.getGeneration()).toBe(1);
    store.set('a', 1);
    store.set('unset', undefined);
    expect(store.getGeneration()).toBe(1);
    store.set('a', 2);
    expect(store.getGeneration()).toBe(2);
    store.set('b', 3);
    expect(store.getGeneration()).toBe(3);
    store.reset();
    expect(store.getGeneration()).toBe(4);
    store.reset();
    expect(store.getGeneration()).toBe(4);
  });

  it('stores values by key, and is changed while it has any', () => {
    const store = new DeckStateStore();
    const listener = vi.fn();
    const changed = vi.fn();
    store.subscribe('a', listener);
    store.subscribeChanged(changed);
    expect(store.get('a')).toBeUndefined();
    store.set('a', 1);
    store.set('a', 1);
    expect(store.get('a')).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getChanged()).toBe(true);
    store.set('a', undefined);
    expect(store.getChanged()).toBe(false);
    expect(changed).toHaveBeenCalledTimes(2);
    store.set('b', 2);
    store.reset();
    expect(store.get('b')).toBeUndefined();
    expect(store.getChanged()).toBe(false);
  });
});

describe('useDeckState', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '#');
  });

  afterEach(() => {
    cleanup();
  });

  it('shares state between slides', async () => {
    const user = userEvent.setup();
    render(
      <Deck>
        <Slide title="First">
          <Answer name="First" />
        </Slide>
        <Slide title="Second">
          <Answer name="Second" />
        </Slide>
      </Deck>,
    );
    await user.click(screen.getByRole('button', { name: 'First: undefined' }));
    await user.keyboard('{PageDown}');
    expect(screen.getByRole('button', { name: 'Second: 1' })).toBeDefined();
  });

  it('resets the deck and its slides from the menu', async () => {
    const user = userEvent.setup();
    render(
      <Deck>
        <Slide title="First">
          <Answer name="First" />
        </Slide>
        <Slide title="Second">
          <Counter />
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
        name: 'Reset deck',
      });
    };
    expect((await resetItem()).getAttribute('aria-disabled')).toBe('true');
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'First: undefined' }));
    await user.keyboard('{PageDown}');
    await user.click(screen.getByRole('button', { name: 'Count: 0' }));
    await user.keyboard('{ArrowRight}');
    expect(window.location.hash).toBe('#slide=2&step=1');
    await user.click(await resetItem());
    expect(screen.getByRole('button', { name: 'Count: 0' })).toBeDefined();
    expect(window.location.hash).toBe('#slide=2');
    await user.keyboard('{PageUp}');
    expect(
      screen.getByRole('button', { name: 'First: undefined' }),
    ).toBeDefined();
    expect((await resetItem()).getAttribute('aria-disabled')).toBe('true');
  });
});
