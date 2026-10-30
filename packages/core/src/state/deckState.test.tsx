import { cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Deck } from '../deck/Deck.tsx';
import { Slide } from '../slide/Slide.tsx';
import { Step } from '../steps/Step.tsx';
import { defineStore } from './defineStore.ts';
import { useStore } from './useStore.ts';
import { useSlideState } from './useSlideState.ts';

const deckNumbers = defineStore<number, string>({ scope: 'deck' });

function Answer({ name }: { name: string }) {
  const [answer, setAnswer] = useStore(deckNumbers, { key: 'answer' });
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

describe('deck stores', () => {
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
    expect((await resetItem()).getAttribute('aria-disabled')).toBeNull();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'First: undefined' }));
    await user.keyboard('{PageDown}');
    await user.click(screen.getByRole('button', { name: 'Count: 0' }));
    await user.keyboard('{ArrowRight}');
    expect(window.location.hash).toBe('#slide=2&step=1');
    await user.click(await resetItem());
    expect(window.location.hash).toBe('#slide=1');
    await user.keyboard('{PageDown}');
    expect(screen.getByRole('button', { name: 'Count: 0' })).toBeDefined();
    expect(window.location.hash).toBe('#slide=2');
    await user.keyboard('{PageUp}');
    expect(
      screen.getByRole('button', { name: 'First: undefined' }),
    ).toBeDefined();
    expect((await resetItem()).getAttribute('aria-disabled')).toBeNull();
  });
});
