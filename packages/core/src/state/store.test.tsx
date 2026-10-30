import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { Dispatch, SetStateAction } from 'react';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from 'vitest';

import { Deck } from '../deck/Deck.tsx';
import { useDeck } from '../deck/DeckContext.ts';
import { Slide } from '../slide/Slide.tsx';
import { SlideViewProvider } from '../view/SlideViewProvider.tsx';
import {
  defineDeckStore,
  defineSlideStore,
  type StoreDefinition,
} from './defineStore.ts';
import { createStateStores, StateStoresContext } from './StateStoresContext.ts';
import { useResetSlideState, useSlideState } from './useSlideState.ts';
import { useStore } from './useStore.ts';

const count = defineSlideStore({ initial: () => 0 });
const transientCount = defineSlideStore({
  initial: () => 0,
  transient: true,
});
const answers = defineDeckStore({ initial: (question: string) => question });
const poll = defineDeckStore({
  initial: () => ({ yes: 0, no: 0 }),
  reduce: (votes, vote: 'yes' | 'no') => ({
    ...votes,
    [vote]: votes[vote] + 1,
  }),
});

function Counter({
  name,
  store = count,
}: {
  name: string;
  store?: typeof count;
}) {
  const [value, setValue] = useStore(store);
  return (
    <button
      type="button"
      onClick={() => {
        setValue((previous) => previous + 1);
      }}
    >
      {`${name}: ${String(value)}`}
    </button>
  );
}

function Answer({ question }: { question: string }) {
  const [answer, setAnswer] = useStore(answers, { key: question });
  return (
    <button
      type="button"
      onClick={() => {
        setAnswer(`${answer}!`);
      }}
    >
      {answer}
    </button>
  );
}

describe('defineSlideStore and defineDeckStore', () => {
  it('infer the types of values, keys, and actions', () => {
    expectTypeOf(count).toEqualTypeOf<
      StoreDefinition<number, undefined, SetStateAction<number>>
    >();
    expectTypeOf(answers).toEqualTypeOf<
      StoreDefinition<string, string, SetStateAction<string>>
    >();
    expectTypeOf(poll).toEqualTypeOf<
      StoreDefinition<{ yes: number; no: number }, undefined, 'yes' | 'no'>
    >();
    expectTypeOf(defineDeckStore<string, number>()).toEqualTypeOf<
      StoreDefinition<
        string | undefined,
        number,
        SetStateAction<string | undefined>
      >
    >();
    expectTypeOf(defineSlideStore()).toEqualTypeOf<
      StoreDefinition<undefined, undefined, SetStateAction<undefined>>
    >();
  });

  it('require a key unless the store allows undefined', () => {
    function Component() {
      expectTypeOf(useStore(count)).toEqualTypeOf<
        [number, Dispatch<SetStateAction<number>>]
      >();
      expectTypeOf(
        useStore(poll, { select: (votes) => votes.yes }),
      ).toEqualTypeOf<[number, Dispatch<'yes' | 'no'>]>();
      // @ts-expect-error The store needs a key.
      useStore(answers);
      // @ts-expect-error The key has the wrong type.
      useStore(answers, { key: 1 });
      // @ts-expect-error The store has no keys.
      useStore(count, { key: 'a' });
      const optional = defineDeckStore({
        initial: (key: string | undefined) => key ?? '',
      });
      useStore(optional);
      useStore(optional, { key: 'a' });
      return null;
    }
    expect(Component).toBeTypeOf('function');
  });
});

describe('the id of a store', () => {
  const initial = () => 0;

  it('keeps its family when it is defined again', () => {
    const first = defineSlideStore({ initial, id: 'kept' });
    expect(defineSlideStore({ initial, id: 'kept' }).family).toBe(first.family);
    expect(defineSlideStore({ initial, id: 'other' }).family).not.toBe(
      first.family,
    );
  });

  it('starts over if the initial value or kind of the store changes', () => {
    const first = defineSlideStore({ initial: () => 0, id: 'changed' });
    expect(
      defineSlideStore({ initial: () => 1, id: 'changed' }).family,
    ).not.toBe(first.family);
    const slide = defineSlideStore({ initial, id: 'kind' });
    expect(defineDeckStore({ initial, id: 'kind' }).family).not.toBe(
      slide.family,
    );
  });

  it('is not needed to tell apart stores', () => {
    expect(defineSlideStore({ initial }).family).not.toBe(
      defineSlideStore({ initial }).family,
    );
  });
});

describe('outside of a Deck', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it.each([
    ['useStore', () => useStore(count)],
    ['useSlideState', () => useSlideState(0)],
    ['useResetSlideState', () => useResetSlideState()],
  ])('%s throws', (_, hook) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    function Component() {
      hook();
      return null;
    }
    expect(() => render(<Component />)).toThrow(
      'Slide and deck state require a Deck',
    );
  });
});

describe('useStore', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '#');
  });

  afterEach(() => {
    cleanup();
  });

  it('shares slide stores between the views of a slide', async () => {
    const user = userEvent.setup();
    render(
      <StateStoresContext value={createStateStores()}>
        <SlideViewProvider
          view={{ index: 0, kind: 'audience', interactive: true }}
        >
          <Counter name="Audience" />
        </SlideViewProvider>
        <SlideViewProvider
          view={{ index: 0, kind: 'preview', interactive: false }}
        >
          <Counter name="Preview" />
        </SlideViewProvider>
        <SlideViewProvider
          view={{ index: 1, kind: 'preview', interactive: false }}
        >
          <Counter name="Other" />
        </SlideViewProvider>
      </StateStoresContext>,
    );
    await user.click(screen.getByRole('button', { name: 'Audience: 0' }));
    expect(screen.getByRole('button', { name: 'Preview: 1' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Other: 0' })).toBeDefined();
  });

  it('keeps slide stores across visits, and transient ones for one visit', async () => {
    const user = userEvent.setup();
    function Flags() {
      const { stateChanged } = useDeck();
      return (
        <output data-testid="flags">{JSON.stringify(stateChanged)}</output>
      );
    }
    render(
      <Deck defaultMouseNavigation={false}>
        <Slide title="First">
          <Counter name="Kept" />
          <Counter name="Transient" store={transientCount} />
          <Flags />
        </Slide>
        <Slide title="Second" />
      </Deck>,
    );
    await user.click(screen.getByRole('button', { name: 'Transient: 0' }));
    expect(screen.getByTestId('flags').textContent).toBe('[false,false]');
    await user.click(screen.getByRole('button', { name: 'Kept: 0' }));
    expect(screen.getByTestId('flags').textContent).toBe('[true,false]');
    await user.keyboard('{PageDown}');
    await user.keyboard('{PageUp}');
    expect(screen.getByRole('button', { name: 'Kept: 1' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Transient: 0' })).toBeDefined();
  });

  it('resets slide stores with the state of the slide', async () => {
    const user = userEvent.setup();
    function Reset() {
      const reset = useResetSlideState();
      return (
        <button type="button" onClick={reset}>
          Reset
        </button>
      );
    }
    render(
      <Deck defaultMouseNavigation={false}>
        <Slide title="First">
          <Counter name="Kept" />
          <Counter name="Transient" store={transientCount} />
          <Reset />
        </Slide>
      </Deck>,
    );
    await user.click(screen.getByRole('button', { name: 'Kept: 0' }));
    await user.click(screen.getByRole('button', { name: 'Transient: 0' }));
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.getByRole('button', { name: 'Kept: 0' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Transient: 1' })).toBeDefined();
  });

  it('shares deck stores between slides by key', async () => {
    const user = userEvent.setup();
    const initial = vi.fn((key: { question: string }) => key.question);
    const tracked = defineDeckStore({ initial });
    function Tracked() {
      const [value] = useStore(tracked, { key: { question: 'q' } });
      return <span>{value}</span>;
    }
    render(
      <Deck defaultMouseNavigation={false}>
        <Slide title="First">
          <Answer question="a" />
          <Answer question="b" />
          <Tracked />
        </Slide>
        <Slide title="Second">
          <Answer question="a" />
          <Tracked />
        </Slide>
      </Deck>,
    );
    await user.click(screen.getByRole('button', { name: 'a' }));
    await user.keyboard('{PageDown}');
    expect(screen.getByRole('button', { name: 'a!' })).toBeDefined();
    expect(initial.mock.calls).toEqual([[{ question: 'q' }]]);
  });

  it('dispatches actions to the reducer', async () => {
    const user = userEvent.setup();
    function Poll() {
      const [votes, vote] = useStore(poll);
      return (
        <button
          type="button"
          onClick={() => {
            vote('yes');
          }}
        >
          {`${String(votes.yes)}:${String(votes.no)}`}
        </button>
      );
    }
    render(
      <Deck>
        <Slide title="Poll">
          <Poll />
        </Slide>
      </Deck>,
    );
    await user.click(screen.getByRole('button', { name: '0:0' }));
    await user.click(screen.getByRole('button', { name: '1:0' }));
    expect(screen.getByRole('button', { name: '2:0' })).toBeDefined();
  });

  it('renders again only if the selected value changes', async () => {
    const user = userEvent.setup();
    const renders = vi.fn();
    function Yes() {
      const [yes, vote] = useStore(poll, {
        select: (votes) => votes.yes,
      });
      renders(yes);
      return (
        <>
          <button
            type="button"
            onClick={() => {
              vote('no');
            }}
          >
            No
          </button>
          <button
            type="button"
            onClick={() => {
              vote('yes');
            }}
          >
            Yes
          </button>
        </>
      );
    }
    render(
      <StateStoresContext value={createStateStores()}>
        <Yes />
      </StateStoresContext>,
    );
    await user.click(screen.getByRole('button', { name: 'No' }));
    await user.click(screen.getByRole('button', { name: 'Yes' }));
    expect(renders.mock.calls).toEqual([[0], [1]]);
  });
});
