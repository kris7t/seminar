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
import { SlideStateScope } from './SlideStateScope.tsx';
import { useResetSlideState, useSlideState } from './useSlideState.ts';
import { createStateStores, StateStoresContext } from './StateStoresContext.ts';
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
    ).toBeNull();
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
    // Slides with steps can always be restarted.
    expect((await resetItem()).getAttribute('aria-disabled')).toBeNull();
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
        <StateStoresContext value={createStateStores()}>
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
        </StateStoresContext>,
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
