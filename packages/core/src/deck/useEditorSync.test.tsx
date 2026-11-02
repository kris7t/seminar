import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { DevChannel } from '../host/devChannel.ts';
import { Slide } from '../slide/Slide.tsx';
import { Step } from '../steps/Step.tsx';
import { Deck } from './Deck.tsx';

const CHANNEL = Symbol.for('seminar.devChannel');

describe('useEditorSync', () => {
  let sent: [string, unknown][];
  let listeners: Map<string, (data: unknown) => void>;

  beforeEach(() => {
    window.history.replaceState(null, '', '#');
    sent = [];
    listeners = new Map();
    const channel: DevChannel = {
      send: (event, data) => {
        sent.push([event, data]);
      },
      on: (event, listener) => {
        listeners.set(event, listener);
        return () => {
          listeners.delete(event);
        };
      },
    };
    Object.assign(globalThis, { [CHANNEL]: channel });
  });

  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(globalThis, CHANNEL);
  });

  function deck(sources = ['1:1', '5:1'], titles = ['First', 'Second']) {
    return (
      <Deck>
        <Slide id="first" title={titles[0]} source={sources[0]} />
        <Slide title={titles[1]} source={sources[1]} />
        <Slide id="third" title="Third" />
      </Deck>
    );
  }

  /** Returns the data of the messages named `event`. */
  function messages(event: string) {
    return sent.filter(([name]) => name === event).map(([, data]) => data);
  }

  function goToSlide(data: object) {
    act(() => {
      listeners.get('goToSlide')?.({ version: 1, ...data });
    });
  }

  it('tells where the slides are, and which one is shown', () => {
    render(deck());
    expect(messages('slides')).toEqual([
      {
        version: 1,
        slides: [
          { id: 'first', start: { line: 1, column: 1 } },
          { start: { line: 5, column: 1 } },
          { id: 'third' },
        ],
      },
    ]);
    expect(messages('location')).toEqual([{ version: 1, slideIndex: 0 }]);
  });

  it('tells again only if the places of the slides change', () => {
    const { rerender } = render(deck());
    rerender(deck(['1:1', '5:1'], ['Changed', 'Second']));
    expect(messages('slides')).toHaveLength(1);
    rerender(deck(['1:1', '7:1']));
    expect(messages('slides')).toHaveLength(2);
  });

  it('goes to slides by their ids, or else their indices', () => {
    render(deck());
    goToSlide({ slideId: 'third', slideIndex: 0 });
    expect(window.location.hash).toBe('#third');
    goToSlide({ slideIndex: 1 });
    expect(window.location.hash).toBe('#slide=2');
  });

  it('tells about moves of the deck, but not those it was asked for', () => {
    render(deck());
    goToSlide({ slideIndex: 1 });
    expect(messages('location')).toHaveLength(1);
    act(() => {
      window.location.hash = '#third';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(messages('location')).toEqual([
      { version: 1, slideIndex: 0 },
      { version: 1, slideIndex: 2 },
    ]);
  });

  it('follows the other pages of the deck, without telling them', () => {
    render(deck());
    act(() => {
      listeners.get('location')?.({ version: 1, slideIndex: 2 });
    });
    expect(window.location.hash).toBe('#third');
    expect(messages('location')).toHaveLength(1);
  });

  it('tells the table of contents, as text', () => {
    render(
      <Deck
        toc={[
          {
            slide: 0,
            title: (
              <>
                The <em>first</em>
              </>
            ),
            children: [{ slide: 1 }],
          },
        ]}
      >
        <Slide id="first" title="First" />
        <Slide />
      </Deck>,
    );
    expect(messages('contents')).toEqual([
      {
        version: 1,
        current: 0,
        entries: [
          expect.objectContaining({
            title: 'The first',
            slideIndex: 0,
            hasSlide: true,
            spare: false,
            children: [
              expect.objectContaining({
                title: '',
                slideIndex: 1,
                steps: false,
                state: false,
              }),
            ],
          }),
        ],
      },
    ]);
  });

  it('tells which slides are recaps, and which have recaps', () => {
    render(
      <Deck toc={[{ slide: 0 }, { slide: 1 }]}>
        <Slide id="first" title="First" />
        <Slide id="again" title="Again" recap="first" />
      </Deck>,
    );
    const { entries } = messages('contents').at(-1) as {
      entries: { recapOf?: number; firstRecap?: number }[];
    };
    expect(entries[0]?.firstRecap).toBe(1);
    expect(entries[1]?.recapOf).toBe(0);
  });

  it('tells again which entry is current', () => {
    render(deck());
    goToSlide({ slideIndex: 1 });
    const { current } = messages('contents').at(-1) as { current?: number };
    // The deck in this test has no table of contents.
    expect(current).toBeUndefined();
  });

  function stepsDeck() {
    return (
      <Deck>
        <Slide id="first" title="First">
          <Step>One</Step>
          <Step>Two</Step>
        </Slide>
        <Slide id="second" title="Second" />
      </Deck>
    );
  }

  /** Returns the last message about the steps. */
  function lastSteps() {
    return messages('steps').at(-1) as {
      slideIndex: number;
      current: number[];
      entries: {
        path: number[];
        label: string;
        skipped: boolean;
        phase: string;
      }[];
    };
  }

  it('tells the steps of the slide, and the current one', () => {
    render(stepsDeck());
    const steps = lastSteps();
    expect(steps.slideIndex).toBe(0);
    expect(steps.current).toEqual([]);
    expect(steps.entries.map(({ path }) => path)).toEqual([[1], [2]]);
    expect(steps.entries[0]).toMatchObject({
      overlay: false,
      skipped: false,
      phase: 'future',
    });
  });

  it('goes to the step that it is asked for, on the current slide only', () => {
    render(stepsDeck());
    act(() => {
      listeners.get('goToStep')?.({ version: 1, slideIndex: 0, path: [2] });
    });
    expect(lastSteps().current).toEqual([2]);
    expect(lastSteps().entries.map(({ phase }) => phase)).toEqual([
      'past',
      'current',
    ]);
    expect(window.location.hash).toBe('#first&step=2');
    act(() => {
      listeners.get('goToStep')?.({ version: 1, slideIndex: 1, path: [1] });
    });
    expect(lastSteps().current).toEqual([2]);
  });

  it('tells the steps of the new slide', () => {
    render(stepsDeck());
    goToSlide({ slideId: 'second' });
    expect(lastSteps()).toMatchObject({ slideIndex: 1, entries: [] });
  });

  it('ignores slides that do not exist, and other versions', () => {
    render(deck());
    goToSlide({ slideIndex: 7 });
    goToSlide({ slideId: 'third', version: 2 });
    expect(window.location.hash).toBe('#first');
  });

  it('does nothing without a channel', () => {
    Reflect.deleteProperty(globalThis, CHANNEL);
    render(deck());
    expect(screen.getByText('First')).toBeDefined();
    expect(sent).toEqual([]);
  });
});
