import { act, cleanup, render, screen } from '@testing-library/react';
import { useEffect, useState, type JSX } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Deck } from '../deck/Deck.tsx';
import { useDeck } from '../deck/DeckContext.ts';
import { Slide } from '../slide/Slide.tsx';
import { useSlideView, type SlideView } from './SlideViewContext.ts';
import { defineStore } from '../state/defineStore.ts';
import { useSlideState } from '../state/useSlideState.ts';
import { useStore } from '../state/useStore.ts';
import { Step } from '../steps/Step.tsx';

function HasSteps(): JSX.Element {
  const { hasSteps } = useDeck();
  return <span data-testid="has-steps">{hasSteps.map(String).join(' ')}</span>;
}

const idle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

describe('useSlideProbe', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '#');
  });

  afterEach(() => {
    cleanup();
  });

  it('finds the steps of slides that were not shown', async () => {
    render(
      <Deck>
        <Slide title="First">
          <HasSteps />
        </Slide>
        <Slide title="Second">
          <Step>Later</Step>
        </Slide>
        <Slide title="Third" />
      </Deck>,
    );
    expect(screen.getByTestId('has-steps').textContent).toBe(
      'false false false',
    );
    await idle();
    expect(screen.getByTestId('has-steps').textContent).toBe(
      'false true false',
    );
  });

  it('finds the state of slides that were not shown', async () => {
    function State(): JSX.Element {
      const { hasState } = useDeck();
      return (
        <span data-testid="has-state">{hasState.map(String).join(' ')}</span>
      );
    }
    function Stateful(): JSX.Element {
      useSlideState(0);
      return <span />;
    }
    render(
      <Deck>
        <Slide title="First">
          <State />
        </Slide>
        <Slide id="second" title="Second">
          <Stateful />
        </Slide>
        <Slide recap="second" />
      </Deck>,
    );
    await idle();
    expect(screen.getByTestId('has-state').textContent).toBe('false true true');
  });

  it('renders slides in probe views that load nothing', async () => {
    const views: { view: SlideView; shown: boolean }[] = [];
    function Probed(): JSX.Element {
      const view = useSlideView();
      return (
        <img
          alt=""
          ref={(element) => {
            if (element !== null) {
              views.push({ view, shown: element.ownerDocument === document });
            }
          }}
        />
      );
    }
    render(
      <Deck>
        <Slide title="First" />
        <Slide title="Second">
          <Probed />
        </Slide>
      </Deck>,
    );
    await idle();
    expect(views).toEqual([
      {
        view: {
          index: 1,
          kind: 'probe',
          interactive: false,
          mirrorPointer: false,
          presented: false,
          visible: false,
          animated: false,
        },
        // In a document without a window, which doesn't load the image.
        shown: false,
      },
    ]);
  });

  it('keeps deck stores from what it renders', async () => {
    const store = defineStore({ scope: 'deck', initial: () => 'initial' });
    const views: string[] = [];
    function Writer(): null {
      const { kind } = useSlideView();
      const [, set] = useStore(store);
      useEffect(() => {
        views.push(kind);
        if (kind === 'probe') set('written by the probe');
      }, [kind, set]);
      return null;
    }
    function Reader(): JSX.Element {
      const [value] = useStore(store);
      const { deckChanged } = useDeck();
      return (
        <output data-testid="deck">{`${value} ${String(deckChanged)}`}</output>
      );
    }
    render(
      <Deck>
        <Slide title="First">
          <Reader />
        </Slide>
        <Slide title="Second">
          <Writer />
        </Slide>
      </Deck>,
    );
    await idle();
    expect(views).toContain('probe');
    expect(screen.getByTestId('deck').textContent).toBe('initial false');
  });

  it('keeps the state of the slides to themselves', async () => {
    let created = 0;
    function Counter(): JSX.Element {
      const [count] = useSlideState(() => {
        created += 1;
        return created;
      });
      return <span>{`Count ${String(count)}`}</span>;
    }
    render(
      <Deck>
        <Slide title="First" />
        <Slide title="Second">
          <Counter />
        </Slide>
      </Deck>,
    );
    await idle();
    expect(created).toBe(1);
    act(() => {
      window.location.hash = '#slide=2';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    // The slide sets up its own state, rather than the one of the probe.
    expect(await screen.findByText('Count 2')).toBeDefined();
  });

  it('keeps probe transient values separate from the currently presented slide', async () => {
    function Mirrored(): JSX.Element {
      const { kind } = useSlideView();
      const [value, setValue] = useSlideState('live', { scope: 'transient' });
      useEffect(() => {
        if (kind === 'probe') setValue('probe');
      }, [kind, setValue]);
      return <span>{value}</span>;
    }
    render(
      <Deck>
        <Slide title="First">
          <Mirrored />
        </Slide>
      </Deck>,
    );
    await idle();
    expect(screen.getByText('live')).toBeDefined();
    expect(screen.queryByText('probe')).toBeNull();
  });

  it('leaves out slides that fail in the probe', async () => {
    function Failing(): JSX.Element {
      const { kind } = useSlideView();
      const [failing] = useState(kind === 'probe');
      if (failing) {
        throw new Error('Not in the probe');
      }
      return <span>Shown</span>;
    }
    render(
      <Deck>
        <Slide title="First">
          <HasSteps />
        </Slide>
        <Slide title="Second">
          <Failing />
          <Step>Later</Step>
        </Slide>
        <Slide title="Third">
          <Step>Later</Step>
        </Slide>
      </Deck>,
    );
    await idle();
    expect(screen.getByTestId('has-steps').textContent).toBe(
      'false false true',
    );
  });
});
