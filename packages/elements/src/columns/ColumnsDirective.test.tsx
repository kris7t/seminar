import {
  __seminarAt,
  Deck,
  Slide,
  SLIDE_WIDTH,
  type DevChannel,
} from '@seminar/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { columnClasses } from './Column.tsx';
import { columnsClasses } from './Columns.tsx';
import { ColumnDirective, ColumnsDirective } from './ColumnsDirective.tsx';

const CHANNEL = Symbol.for('seminar.devChannel');
const FILE = '/deck.deck.mdx';

/** Lays out the slide, which jsdom doesn't: a row of two columns. */
function layOut(this: Element): DOMRect {
  const box = (x: number, width: number) =>
    ({ left: x, top: 100, width, height: 200 }) as DOMRect;
  if (this.hasAttribute('data-seminar-view')) {
    return { left: 0, top: 0, width: SLIDE_WIDTH, height: 1080 } as DOMRect;
  }
  if (this.classList.contains(columnsClasses.root)) {
    return box(100, 800);
  }
  if (this.classList.contains(columnClasses.root)) {
    return this.previousElementSibling === null ? box(100, 380) : box(520, 380);
  }
  return box(0, 0);
}

describe('ColumnsDirective', () => {
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
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
      layOut,
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    Reflect.deleteProperty(globalThis, CHANNEL);
  });

  function renderColumns() {
    render(
      <Deck>
        <Slide>
          {__seminarAt(
            <ColumnsDirective>
              {__seminarAt(
                <ColumnDirective data-testid="first">A</ColumnDirective>,
                '1:1-3:4',
                FILE,
              )}
              {__seminarAt(
                <ColumnDirective data-testid="second">B</ColumnDirective>,
                '5:1-7:4',
                FILE,
              )}
            </ColumnsDirective>,
            '1:1-7:4',
            FILE,
          )}
        </Slide>
      </Deck>,
    );
  }

  const flex = (testId: string) =>
    getComputedStyle(screen.getByTestId(testId)).flex;

  /** Drags the divider by `dx` without releasing it. */
  function drag(dx: number) {
    const divider = screen.getByRole('separator', {
      name: 'Resize the columns',
    });
    fireEvent.pointerDown(divider, { pointerId: 1, clientX: 500 });
    fireEvent.pointerMove(divider, { pointerId: 1, clientX: 500 + dx });
    return divider;
  }

  it('resizes the columns next to the divider, and edits their source', () => {
    renderColumns();
    const divider = drag(42);
    expect([flex('first'), flex('second')]).toEqual(['1.1 1 0px', '0.9 1 0px']);
    fireEvent.pointerUp(divider, { pointerId: 1, clientX: 542 });
    const range = (start: number, end: number) => ({
      start: { line: start, column: 1 },
      end: { line: end, column: 4 },
      file: FILE,
    });
    expect(sent.filter(([event]) => event === 'editAttributes')).toEqual([
      [
        'editAttributes',
        {
          version: 1,
          edits: [
            { range: range(1, 3), changes: { grow: 1.1 } },
            { range: range(5, 7), changes: { grow: 0.9 } },
          ],
        },
      ],
    ]);
    // Until the deck is saved, as the editor tells.
    listeners.get('pendingAttributes')?.({
      version: 1,
      file: FILE,
      entries: [
        {
          range: range(1, 3),
          saved: {},
          attributes: { grow: 1.1 },
        },
        {
          range: range(5, 7),
          saved: {},
          attributes: { grow: 0.9 },
        },
      ],
    });
    expect([flex('first'), flex('second')]).toEqual(['1.1 1 0px', '0.9 1 0px']);
  });

  it('leaves the columns as they were when dragging is cancelled', () => {
    renderColumns();
    drag(42);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect([flex('first'), flex('second')]).toEqual(['1 1 0px', '1 1 0px']);
    expect(sent.some(([event]) => event === 'editAttributes')).toBe(false);
  });

  it.each([
    [false, true, 1],
    [true, true, 0],
  ])(
    'has a divider unless both columns are hidden steps (%s, %s)',
    (firstStep, secondStep, dividers) => {
      render(
        <Deck>
          <Slide>
            {__seminarAt(
              <ColumnsDirective>
                {__seminarAt(
                  <ColumnDirective step={firstStep}>A</ColumnDirective>,
                  '1:1-3:4',
                  FILE,
                )}
                {__seminarAt(
                  <ColumnDirective step={secondStep}>B</ColumnDirective>,
                  '5:1-7:4',
                  FILE,
                )}
              </ColumnsDirective>,
              '1:1-7:4',
              FILE,
            )}
          </Slide>
        </Deck>,
      );
      expect(screen.queryAllByRole('separator')).toHaveLength(dividers);
    },
  );

  it('has no handles without an editor', () => {
    Reflect.deleteProperty(globalThis, CHANNEL);
    renderColumns();
    expect(screen.queryByRole('separator')).toBeNull();
    expect(flex('first')).toBe('1 1 0px');
  });
});
