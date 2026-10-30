import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Deck } from '../deck/Deck.tsx';
import { useDeck } from '../deck/DeckContext.ts';
import { Slide } from '../slide/Slide.tsx';
import { Step } from '../steps/Step.tsx';
import { SlideStateNamespace } from './SlideStateNamespace.tsx';
import { useResetSlideState, useSlideState } from './useSlideState.ts';
import { createStateStores, StateStoresContext } from './StateStoresContext.ts';
import { SlideViewProvider } from '../view/SlideViewProvider.tsx';

function Counter({
  name,
  stateId,
  transient = false,
}: {
  name: string;
  stateId?: string;
  transient?: boolean;
}) {
  const [count, setCount] = useSlideState(0, {
    id: stateId,
    scope: transient ? 'transient' : 'slide',
  });
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
    // The presenter can still clear them, once they have changed.
    expect(
      menu
        .getByRole('menuitem', { name: 'Reset slide' })
        .getAttribute('aria-disabled'),
    ).toBeNull();
    expect(
      menu
        .getByRole('menuitem', { name: 'Reset deck' })
        .getAttribute('aria-disabled'),
    ).toBeNull();
    await user.click(menu.getByRole('menuitem', { name: 'Reset slide' }));
    expect(screen.getByRole('button', { name: 'Mirror: 0' })).toBeDefined();
    await user.pointer({
      keys: '[MouseRight]',
      target: screen.getByRole('heading', { name: 'First' }),
    });
    expect(
      within(await screen.findByRole('menu'))
        .getByRole('menuitem', { name: 'Reset slide' })
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
    expect(screen.getByRole('button', { name: 'Mirror: 0' })).toBeDefined();
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
          <Counter name="Mirror" transient />
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
    await user.click(screen.getByRole('button', { name: 'Mirror: 0' }));
    await user.keyboard('{ArrowRight}');
    expect(window.location.hash).toBe('#slide=1&step=1');
    await user.click(await resetItem());
    expect(screen.getByRole('button', { name: 'A: 0' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Mirror: 0' })).toBeDefined();
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

  it('identifies state by ids and namespaces', async () => {
    const user = userEvent.setup();
    function Toggle() {
      const [shown, setShown] = useState(false);
      return shown ? (
        <Counter name="late" stateId="late" />
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
          <SlideStateNamespace id="left">
            <Counter name="left" />
          </SlideStateNamespace>
          <SlideStateNamespace id="right">
            <Counter name="right" />
          </SlideStateNamespace>
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

  describe('with a lazy initial value', () => {
    function renderViews(children: ReactNode) {
      return render(
        <StateStoresContext value={createStateStores()}>
          <SlideViewProvider
            view={{ index: 0, kind: 'audience', interactive: true }}
          >
            {children}
          </SlideViewProvider>
          <SlideViewProvider
            view={{ index: 0, kind: 'preview', interactive: false }}
          >
            {children}
          </SlideViewProvider>
        </StateStoresContext>,
      );
    }

    it('computes it once for all views, and again after a reset', async () => {
      const user = userEvent.setup();
      const initial = vi.fn(() => ({}));
      const seen: unknown[] = [];
      function Lazy() {
        const [value] = useSlideState(initial);
        const reset = useResetSlideState();
        seen.push(value);
        return (
          <button type="button" onClick={reset}>
            Reset
          </button>
        );
      }
      renderViews(<Lazy />);
      expect(initial).toHaveBeenCalledOnce();
      const before = seen.at(-1);
      const [button] = screen.getAllByRole('button', { name: 'Reset' });
      await user.click(button ?? document.body);
      expect(initial).toHaveBeenCalledTimes(2);
      expect(seen.at(-1)).not.toBe(before);
    });

    it('only warns if another component has the same id', () => {
      const warn = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);
      function Same({ initial }: { initial: number | (() => number) }) {
        useSlideState(initial, { id: 'same' });
        return null;
      }
      renderViews(
        <>
          <Same initial={1} />
          <Same initial={() => 2} />
        </>,
      );
      expect(warn).toHaveBeenCalledTimes(2);
    });
  });

  it('uses the initial value of another id when the id changes', async () => {
    const user = userEvent.setup();
    function Keyed() {
      const [id, setId] = useState('a');
      const [value] = useSlideState(`initial of ${id}`, { id });
      return (
        <button
          type="button"
          onClick={() => {
            setId('b');
          }}
        >
          {value}
        </button>
      );
    }
    render(
      <StateStoresContext value={createStateStores()}>
        <SlideViewProvider
          view={{ index: 0, kind: 'audience', interactive: true }}
        >
          <Keyed />
        </SlideViewProvider>
      </StateStoresContext>,
    );
    await user.click(screen.getByRole('button', { name: 'initial of a' }));
    expect(screen.getByRole('button', { name: 'initial of b' })).toBeDefined();
  });

  describe('with the same state in several components', () => {
    function Value({
      initial,
      transient = false,
      stateId = 'same',
    }: {
      initial: unknown;
      transient?: boolean;
      stateId?: string | null;
    }) {
      const [value] = useSlideState(initial, {
        id: stateId ?? undefined,
        scope: transient ? 'transient' : 'slide',
      });
      return <output>{JSON.stringify(value)}</output>;
    }
    function renderView(children: ReactNode) {
      return render(
        <StateStoresContext value={createStateStores()}>
          <SlideViewProvider
            view={{ index: 0, kind: 'audience', interactive: true }}
          >
            {children}
          </SlideViewProvider>
        </StateStoresContext>,
      );
    }
    const silenceWarnings = () =>
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    it('warns, since they share it', () => {
      const warn = silenceWarnings();
      renderView(
        <>
          <Value initial={[1, { a: 2 }]} />
          <Value initial={[1, { a: 2 }]} />
          <Value initial={[1, { a: 2 }]} />
        </>,
      );
      expect(warn).toHaveBeenCalledOnce();
      expect(warn.mock.calls[0]?.[0]).toContain('"/same"');
    });

    it('tells apart components without ids by their order', () => {
      const warn = silenceWarnings();
      renderView(
        <>
          <Value initial={[]} stateId={null} />
          <Value initial={[1]} stateId={null} />
          <Value initial={[]} stateId={null} transient />
        </>,
      );
      expect(warn).not.toHaveBeenCalled();
    });

    it('throws for the same id of transient and other state', () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      renderView(
        <>
          <Value initial={1} />
          <Value initial={1} transient />
        </>,
      );
      expect(screen.getByRole('alert').textContent).toContain(
        'in different scopes',
      );
    });

    it('throws for namespaces with the same id, rather than for their state', () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const warn = silenceWarnings();
      renderView(
        <>
          <SlideStateNamespace id="a">
            <Value initial={1} stateId={null} />
          </SlideStateNamespace>
          <SlideStateNamespace id="a">
            <Value initial={2} stateId={null} />
          </SlideStateNamespace>
        </>,
      );
      expect(screen.getByRole('alert').textContent).toContain('"/a"');
      expect(warn).not.toHaveBeenCalled();
      cleanup();
      renderView(
        <>
          <SlideStateNamespace id="a" />
          <SlideStateNamespace id="a" />
        </>,
      );
      expect(screen.getByRole('alert').textContent).toContain('"/a"');
    });

    it('allows the same id in other namespaces', () => {
      renderView(
        <>
          <SlideStateNamespace id="a">
            <SlideStateNamespace id="c" />
          </SlideStateNamespace>
          <SlideStateNamespace id="b">
            <SlideStateNamespace id="c" />
          </SlideStateNamespace>
        </>,
      );
    });

    it('only warns about initial values that it cannot compare', () => {
      const warn = silenceWarnings();
      const makeFunction = () => () => 0;
      renderView(
        <>
          <Value initial={new Date(0)} />
          <Value initial={new Date(1)} />
          <Value stateId="nested" initial={[new Date(0), 1]} />
          <Value stateId="nested" initial={[new Date(1), 1]} />
          <Value stateId="function" initial={makeFunction} />
          <Value stateId="function" initial={makeFunction} />
        </>,
      );
      expect(warn).toHaveBeenCalledTimes(3);
    });

    it.each([
      [1, 2, false],
      [{ a: 1 }, { a: 2 }, false],
      [[1], [1, 2], false],
      [[], {}, false],
      [[new Date(0), 1], [new Date(0), 2], false],
      [new Date(0), 1, false],
    ])(
      'throws with different initial values (%j, %j, transient: %j)',
      (a, b, transient) => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        renderView(
          <>
            <Value initial={a} />
            <Value initial={b} transient={transient} />
          </>,
        );
        expect(screen.getByRole('alert').textContent).toContain(
          'different initial values',
        );
      },
    );

    it('allows the same id in other views and namespaces, and after unmounting', async () => {
      const user = userEvent.setup();
      const warn = silenceWarnings();
      function Tabs() {
        const [tab, setTab] = useState(0);
        return (
          <>
            <button
              type="button"
              onClick={() => {
                setTab(1);
              }}
            >
              Next tab
            </button>
            <Value key={tab} initial={1} />
          </>
        );
      }
      render(
        <StateStoresContext value={createStateStores()}>
          <SlideViewProvider
            view={{ index: 0, kind: 'audience', interactive: true }}
          >
            <Tabs />
            <SlideStateNamespace id="a">
              <Value initial={2} />
            </SlideStateNamespace>
            <SlideStateNamespace id="b">
              <Value initial={3} />
            </SlideStateNamespace>
          </SlideViewProvider>
          <SlideViewProvider
            view={{ index: 0, kind: 'preview', interactive: false }}
          >
            <Value initial={1} />
          </SlideViewProvider>
        </StateStoresContext>,
      );
      await user.click(screen.getByRole('button', { name: 'Next tab' }));
      expect(warn).not.toHaveBeenCalled();
    });
  });

  it('warns about components without ids that mount later', async () => {
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
        expect.stringContaining('without an id'),
      );
    });
  });
});
