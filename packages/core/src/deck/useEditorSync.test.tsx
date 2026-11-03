import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { StrictMode, type JSX } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DevChannel } from '../host/devChannel.ts';
import { __seminarAt } from '../host/sourceRanges.ts';
import { Slide } from '../slide/Slide.tsx';
import { Step } from '../steps/Step.tsx';
import { useStep } from '../steps/useSteps.ts';
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

  function deck(sources = [1, 5], titles = ['First', 'Second']) {
    return (
      <Deck>
        {__seminarAt(
          <Slide id="first" title={titles[0]} />,
          `${String(sources[0])}:1-${String(sources[0])}:5`,
        )}
        {__seminarAt(
          <Slide title={titles[1]} />,
          `${String(sources[1])}:1-${String(sources[1])}:5`,
        )}
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
    expect(messages('location')).toEqual([
      { version: 1, slideIndex: 0, initial: true, restored: false },
    ]);
  });

  it('tells where recaps are, rather than the slides that they show', () => {
    render(
      <Deck>
        {__seminarAt(<Slide id="first" title="First" />, '1:1-1:5')}
        {__seminarAt(<Slide id="again" recap="first" />, '9:1-9:5')}
      </Deck>,
    );
    expect(messages('slides')).toEqual([
      {
        version: 1,
        slides: [
          { id: 'first', start: { line: 1, column: 1 } },
          { id: 'again', start: { line: 9, column: 1 } },
        ],
      },
    ]);
  });

  it('tells again only if the places of the slides change', () => {
    const { rerender } = render(deck());
    rerender(deck([1, 5], ['Changed', 'Second']));
    expect(messages('slides')).toHaveLength(1);
    rerender(deck([1, 7]));
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
      { version: 1, slideIndex: 0, initial: true, restored: false },
      { version: 1, slideIndex: 2 },
    ]);
  });

  it('tells where it starts only once in strict mode', () => {
    render(<StrictMode>{deck()}</StrictMode>);
    expect(messages('location')).toEqual([
      { version: 1, slideIndex: 0, initial: true, restored: false },
    ]);
  });

  it('tells if the location chose the slide that it starts on', () => {
    window.history.replaceState(null, '', '#third');
    render(deck());
    expect(messages('location')).toEqual([
      { version: 1, slideIndex: 2, initial: true, restored: true },
    ]);
  });

  it('stays when another page of the deck starts', () => {
    render(deck());
    goToSlide({ slideId: 'third' });
    act(() => {
      listeners.get('location')?.({
        version: 1,
        slideIndex: 0,
        initial: true,
        restored: false,
      });
    });
    expect(window.location.hash).toBe('#third');
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

  it('goes to the step that it is asked for, on the current slide only', async () => {
    render(stepsDeck());
    act(() => {
      listeners.get('goToStep')?.({ version: 1, slideIndex: 0, path: [2] });
    });
    await act(async () => {
      await Promise.resolve();
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

  it('goes right to a step of another slide', async () => {
    render(
      <Deck>
        <Slide id="first" title="First" />
        <Slide id="second" title="Second">
          <Step>One</Step>
          <Step>Two</Step>
        </Slide>
      </Deck>,
    );
    goToSlide({ slideId: 'second', path: [2] });
    await act(async () => {
      await Promise.resolve();
    });
    expect(window.location.hash).toBe('#second&step=2');
    expect(lastSteps()).toMatchObject({ slideIndex: 1, current: [2] });
  });

  it('goes to a step of the slide it is on', () => {
    render(stepsDeck());
    goToSlide({ slideId: 'first', path: [1] });
    expect(window.location.hash).toBe('#first&step=1');
  });

  it('tells where the steps of all slides are, once they are probed', async () => {
    render(
      <Deck>
        <Slide id="first" title="First">
          {__seminarAt(<Step>One</Step>, '3:1-3:5')}
        </Slide>
        <Slide id="second" title="Second">
          {__seminarAt(<Step>Two</Step>, '7:1-7:5')}
          {__seminarAt(<Step>Three</Step>, '9:1-9:5')}
        </Slide>
      </Deck>,
    );
    await vi.waitFor(() => {
      expect(messages('probe').at(-1)).toMatchObject({
        slides: [
          [{ start: { line: 3, column: 1 }, path: [1] }],
          [
            { start: { line: 7, column: 1 }, path: [1] },
            { start: { line: 9, column: 1 }, path: [2] },
          ],
        ],
      });
    });
    await act(async () => {
      await Promise.resolve();
    });
  });

  it('tells the steps of the new slide', () => {
    render(stepsDeck());
    goToSlide({ slideId: 'second' });
    expect(lastSteps()).toMatchObject({ slideIndex: 1, entries: [] });
  });

  describe('going to the source', () => {
    function sourceDeck() {
      return (
        <Deck>
          {__seminarAt(
            <Slide id="first" title="First">
              {__seminarAt(<p>Paragraph</p>, '3:1-3:10', '/deck.mdx')}
            </Slide>,
            '1:1-1:8',
          )}
          <Slide id="second" title="Second" />
        </Deck>
      );
    }

    it('tells where a clicked element is, without going to the next slide', () => {
      render(sourceDeck());
      const [paragraph] = screen.getAllByText('Paragraph');
      if (paragraph === undefined) {
        throw new Error('No paragraph');
      }
      const notPrevented = fireEvent.click(paragraph, { ctrlKey: true });
      expect(notPrevented).toBe(false);
      expect(messages('goToSource')).toEqual([
        {
          version: 1,
          range: {
            start: { line: 3, column: 1 },
            end: { line: 3, column: 10 },
            file: '/deck.mdx',
          },
        },
      ]);
      expect(window.location.hash).toBe('#first');
    });

    it('also takes Cmd', () => {
      render(sourceDeck());
      const [paragraph] = screen.getAllByText('Paragraph');
      if (paragraph !== undefined) {
        fireEvent.click(paragraph, { metaKey: true });
      }
      expect(messages('goToSource')).toHaveLength(1);
    });

    it('leaves other clicks alone', () => {
      render(sourceDeck());
      const [paragraph] = screen.getAllByText('Paragraph');
      if (paragraph !== undefined) {
        expect(fireEvent.click(paragraph)).toBe(true);
      }
      expect(messages('goToSource')).toEqual([]);
    });

    it('leaves clicks on what has no source alone', () => {
      render(deck());
      expect(fireEvent.click(document.body, { ctrlKey: true })).toBe(true);
      expect(messages('goToSource')).toEqual([]);
    });
  });

  describe('the steps in the source', () => {
    function sourceSteps(behavior: 'only' | 'reveal' = 'reveal') {
      return (
        <Deck>
          <Slide id="first" title="First">
            {__seminarAt(<Step behavior={behavior}>One</Step>, '3:1-3:5', '/a')}
            {__seminarAt(<Step behavior={behavior}>Two</Step>, '5:1-5:5', '/a')}
            <Step>Unknown</Step>
          </Slide>
        </Deck>
      );
    }

    function sources() {
      return (
        messages('steps').at(-1) as {
          sources: {
            start: { line: number };
            file: string;
            path: number[];
            visible: boolean;
          }[];
        }
      ).sources;
    }

    function goToStep(path: number[]) {
      act(() => {
        listeners.get('goToStep')?.({ version: 1, slideIndex: 0, path });
      });
    }

    async function settled() {
      await act(async () => {
        await Promise.resolve();
      });
    }

    it('tells where the steppers are, and the steps that show them', async () => {
      render(sourceSteps());
      await settled();
      expect(sources()).toEqual([
        expect.objectContaining({
          start: { line: 3, column: 1 },
          end: { line: 3, column: 5 },
          file: '/a',
          path: [1],
          last: 1,
        }),
        expect.objectContaining({
          start: { line: 5, column: 1 },
          path: [2],
          last: 2,
        }),
      ]);
    });

    it('tells which ones are visible as the step changes', async () => {
      render(sourceSteps());
      await settled();
      expect(sources().map(({ visible }) => visible)).toEqual([false, false]);
      goToStep([1]);
      await settled();
      expect(sources().map(({ visible }) => visible)).toEqual([true, false]);
      goToStep([2]);
      await settled();
      expect(sources().map(({ visible }) => visible)).toEqual([true, true]);
    });

    it('tells where elements linked to a stepper are, with its step', async () => {
      function Linked(): JSX.Element {
        const shared = useStep();
        return (
          <>
            {__seminarAt(<p ref={shared.ref}>Here</p>, '3:1-3:5')}
            {__seminarAt(<Step with={shared}>There</Step>, '7:1-7:6')}
          </>
        );
      }
      render(
        <Deck>
          <Slide id="first" title="First">
            {__seminarAt(<Step>Before</Step>, '1:1-1:6')}
            {__seminarAt(<Linked />, '2:1-9:1')}
          </Slide>
        </Deck>,
      );
      await settled();
      const linked = () => sources().find(({ start }) => start.line === 7);
      expect(linked()).toMatchObject({ path: [2], visible: false });
      goToStep([2]);
      await settled();
      expect(linked()).toMatchObject({ path: [2], visible: true });
      goToStep([1]);
      await settled();
      expect(linked()).toMatchObject({ visible: false });
    });

    it('tells that steps that leave are not visible', async () => {
      render(sourceSteps('only'));
      await settled();
      goToStep([2]);
      await settled();
      expect(sources().map(({ visible }) => visible)).toEqual([false, true]);
    });
  });

  it('tells when the presenter uses the page', () => {
    render(deck());
    expect(messages('input')).toEqual([]);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.pointerDown(window);
    fireEvent.wheel(window);
    expect(messages('input')).toHaveLength(3);
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
