import {
  __seminarAt,
  Deck,
  Slide,
  SLIDE_WIDTH,
  type DevChannel,
} from '@seminar/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CalloutDirective } from './CalloutDirective.tsx';

const CHANNEL = Symbol.for('seminar.devChannel');
const FILE = '/deck.deck.mdx';
const RANGE = '3:5-3:30';

/** Lays out the slide, which jsdom doesn't, at its logical size. */
function layOut(this: Element): DOMRect {
  return (
    this.hasAttribute('data-seminar-view')
      ? { left: 0, top: 0, width: SLIDE_WIDTH, height: 1080 }
      : { left: 0, top: 0, width: 0, height: 0 }
  ) as DOMRect;
}

describe('CalloutHandles', () => {
  let sent: [string, unknown][];

  beforeEach(() => {
    window.history.replaceState(null, '', '#');
    sent = [];
    const channel: DevChannel = {
      send: (event, data) => {
        sent.push([event, data]);
      },
      on: () => () => undefined,
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

  function renderCallout(
    props: object = {},
    hovered = true,
    content: ReactNode = 'Note',
  ) {
    render(
      <Deck>
        <Slide>
          <p>
            Text
            {__seminarAt(
              // Shown from the start, rather than as a step of its own.
              <CalloutDirective with="initial" {...props}>
                {content}
              </CalloutDirective>,
              RANGE,
              FILE,
            )}
          </p>
        </Slide>
      </Deck>,
    );
    // The handles show while the callout is under the pointer.
    if (hovered) {
      fireEvent.pointerOver(screen.getByText('Note'));
    }
  }

  /** Drags `element` by `dx`, `dy`, and releases it. */
  function dragElement(element: Element, dx: number, dy: number) {
    fireEvent.pointerDown(element, { pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(element, { pointerId: 1, clientX: dx, clientY: dy });
    fireEvent.pointerUp(element, { pointerId: 1, clientX: dx, clientY: dy });
  }

  /** Drags the handle labeled `name` by `dx`, `dy`, and releases it. */
  function drag(name: string, dx: number, dy: number) {
    dragElement(screen.getByRole('button', { name }), dx, dy);
  }

  /** The changes that the page asked the editor to make. */
  const edited = () =>
    sent.flatMap(([event, data]) =>
      event === 'editAttributes'
        ? (data as { edits: { changes: object }[] }).edits.map(
            ({ changes }) => changes,
          )
        : [],
    );

  it('turns and stretches the stem by moving the body', () => {
    renderCallout({ angle: 90, offset: 40 });
    dragElement(screen.getByText('Note'), 0, -60);
    expect(edited()).toEqual([{ angle: 90, offset: 100 }]);
  });

  it('moves the stem along the body, which stays where it is', () => {
    renderCallout({ angle: 90, offset: 40, stemOffset: 0.5 });
    // Along the bottom edge, 360 wide, of the body above the tip.
    drag('Move the stem of the callout along its edge', 36, 0);
    const [changes] = edited();
    expect(changes).toMatchObject({ stemOffset: 0.6 });
    // The stem turns from the base, 36 to the right, to the tip.
    const { angle, offset } = changes as { angle: number; offset: number };
    expect(angle).toBe(Math.round((Math.atan2(40, -36) * 180) / Math.PI));
    expect(offset).toBe(Math.round(Math.hypot(40, 36)));
  });

  it('leaves interactive elements in the body to work, unless Alt is held', () => {
    const onClick = vi.fn();
    renderCallout({ angle: 90, offset: 40 }, true, [
      'Note',
      <button key="button" type="button" onClick={onClick}>
        Press
      </button>,
    ]);
    const button = screen.getByRole('button', { name: 'Press' });
    dragElement(button, 0, -60);
    fireEvent.click(button);
    expect(edited()).toEqual([]);
    expect(onClick).toHaveBeenCalledOnce();
    fireEvent.pointerDown(button, { pointerId: 1, altKey: true });
    fireEvent.pointerMove(button, { pointerId: 1, clientY: -60 });
    fireEvent.pointerUp(button, { pointerId: 1, clientY: -60 });
    expect(edited()).toEqual([{ angle: 90, offset: 100 }]);
  });

  it('only drags the body once the pointer moves', () => {
    renderCallout({ angle: 90, offset: 40 });
    dragElement(screen.getByText('Note'), 2, 0);
    expect(edited()).toEqual([]);
  });

  it('shows the handles of the callout that was clicked, until Escape', () => {
    renderCallout({ angle: 90 }, false);
    const move = () =>
      screen.queryByRole('button', { name: 'Move what the callout points at' });
    expect(move()).toBeNull();
    fireEvent.click(screen.getByText('Note'));
    expect(move()).not.toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(move()).toBeNull();
  });

  it('keeps the slide at its step when clicking the callout', () => {
    renderCallout({ angle: 90 }, false);
    const clicked = fireEvent.click(screen.getByText('Note'));
    expect(clicked).toBe(false);
  });

  it('has no handles while the callout is a step that is not shown', () => {
    renderCallout({ angle: 90, with: undefined });
    expect(
      screen.queryByRole('button', { name: 'Move what the callout points at' }),
    ).toBeNull();
  });

  it('shifts what callouts in the text point at', () => {
    renderCallout({ shift: '0,-4' });
    drag('Move what the callout points at', 10, 6);
    expect(edited()).toEqual([{ shift: '10,2' }]);
  });

  it('moves the point on the slide of other callouts, in its units', () => {
    renderCallout({ directive: 'leaf', at: '50%,40%', angle: 90 });
    drag('Move what the callout points at', SLIDE_WIDTH / 10, 0);
    expect(edited()).toEqual([{ at: '60%,40%' }]);
  });

  it.each([
    ['right', 50],
    ['left', -50],
  ])('resizes the body from the %s, keeping the other side', (side, dx) => {
    renderCallout({ width: 200, angle: 90, offset: 40 });
    drag(`Resize the callout from the ${side}`, dx, 0);
    const [changes] = edited();
    expect(changes).toMatchObject({ width: 250 });
    // The stem turns, so that the body stays put on the other side.
    expect(changes).toHaveProperty('angle');
    expect(changes).toHaveProperty('offset');
  });

  it('removes what a handle sets when it is double-clicked', () => {
    renderCallout({ angle: 90, shift: '0,-4' });
    fireEvent.doubleClick(
      screen.getByRole('button', { name: 'Move what the callout points at' }),
    );
    expect(edited()).toEqual([{ shift: null }]);
  });
});
