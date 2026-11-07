import {
  __seminarAt,
  Deck,
  Slide,
  SLIDE_WIDTH,
  createSlideTheme,
  type DevChannel,
} from '@seminar/core';
import type { Theme } from '@mui/material/styles';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { calloutClasses } from './Callout.tsx';
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
      // The editor tells pages that it's there.
      on: (event, listener) => {
        if (event === 'editor') {
          listener({ version: 1 });
        }
        return () => undefined;
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

  function renderCallout(
    props: object = {},
    hovered = true,
    content: ReactNode = 'Note',
    theme?: Theme,
  ) {
    render(
      <Deck {...(theme === undefined ? {} : { theme })}>
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

  it('stops the stem where the body would have to move', () => {
    renderCallout({ angle: 90, offset: 40, stemOffset: 0.5 });
    // Beyond 40 to the right, the stem would turn to the left edge.
    drag('Move the stem of the callout along its edge', 200, 0);
    const [changes] = edited();
    expect(changes).toMatchObject({ stemOffset: 0.6 });
    const { angle, offset } = changes as { angle: number; offset: number };
    expect(angle).toBe(Math.round((Math.atan2(40, -36) * 180) / Math.PI));
    expect(offset).toBe(Math.round(Math.hypot(40, 36)));
  });

  it('marks the stem with a diamond and the tip with a circle', () => {
    renderCallout({ angle: 90 });
    const shapes = [...document.querySelectorAll('[data-shape]')].map((mark) =>
      mark.getAttribute('data-shape'),
    );
    // After the squares on the corners of the body.
    expect(shapes.slice(4)).toEqual(['diamond', 'circle']);
  });

  const CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

  /**
   * The squares on the corners of the bodies of callouts, from the top left
   * to the bottom right.
   */
  const cornersOf = (callout = 0) =>
    [...document.querySelectorAll('[data-shape="square"]')].slice(
      callout * 4,
      callout * 4 + 4,
    );

  /** The corners of the body that are lit up. */
  const highlightedCorners = () =>
    cornersOf().flatMap((corner, index) =>
      corner.hasAttribute('data-highlighted') ? [CORNERS[index]] : [],
    );

  it('marks the corners of the body, without lighting them up to move it', () => {
    renderCallout({ angle: 90 });
    expect(cornersOf()).toHaveLength(4);
    expect(highlightedCorners()).toEqual([]);
  });

  it.each([
    ['filled', true],
    ['outlined', false],
  ])(
    'outlines the stem handle for the bubble of %s callouts',
    (variant, onDark) => {
      renderCallout({ angle: 90, color: 'text.primary', variant });
      const stem = document.querySelector('[data-shape="diamond"]');
      expect(stem?.hasAttribute('data-on-dark')).toBe(onDark);
    },
  );

  it('lets the stem be dragged like the body', () => {
    renderCallout({ angle: 90 });
    const stem = document.querySelector(`.${calloutClasses.background} > path`);
    expect(stem).not.toBeNull();
    if (stem === null) return;
    expect(getComputedStyle(stem).pointerEvents.toLowerCase()).toBe(
      'visiblepainted',
    );
  });

  it.each(['left', 'right'])(
    'lights up the corners on the %s while resizing from a corner',
    (side) => {
      renderCallout({ angle: 90 }, false);
      fireEvent.click(screen.getByText('Note'));
      const handle = screen.getByRole('button', {
        name: `Resize the callout from the bottom ${side}`,
      });
      fireEvent.pointerEnter(handle);
      expect(highlightedCorners()).toEqual([`top-${side}`, `bottom-${side}`]);
    },
  );

  it('outlines handles for the background of the slide', () => {
    renderCallout(
      { angle: 90 },
      true,
      'Note',
      createSlideTheme({ palette: { mode: 'dark' } }),
    );
    const tip = document.querySelector('[data-shape="circle"]');
    expect(tip?.hasAttribute('data-on-dark')).toBe(true);
  });

  it.each(['left', 'right'])(
    'lights up the corners on the %s while resizing from there',
    (side) => {
      // Selected, rather than under the pointer.
      renderCallout({ angle: 90 }, false);
      fireEvent.click(screen.getByText('Note'));
      const handle = screen.getByRole('button', {
        name: `Resize the callout from the ${side}`,
      });
      fireEvent.pointerEnter(handle);
      expect(highlightedCorners()).toEqual([`top-${side}`, `bottom-${side}`]);
      fireEvent.pointerLeave(handle);
      expect(highlightedCorners()).toEqual([]);
    },
  );

  it('lights up a handle under the pointer', () => {
    renderCallout({ angle: 90 });
    const handle = screen.getByRole('button', {
      name: 'Move what the callout points at',
    });
    const mark = document.querySelectorAll('[data-shape="circle"]').item(0);
    expect(mark.hasAttribute('data-highlighted')).toBe(false);
    fireEvent.pointerEnter(handle);
    expect(mark.hasAttribute('data-highlighted')).toBe(true);
  });

  it('stays hovered along its stem, on the way to its tip', () => {
    renderCallout({ angle: 90, offset: 100 });
    const tip = () =>
      document.querySelector('[aria-label="Move what the callout points at"]');
    const frame = screen.getByText('Note').closest('[data-seminar-view]');
    const bridge = document.querySelector('svg[aria-hidden] > path:only-child');
    expect(bridge).not.toBeNull();
    if (frame === null || bridge === null) return;
    // From the body onto the stem, which takes the pointer over the slide.
    fireEvent.pointerLeave(frame, { relatedTarget: bridge });
    fireEvent.pointerEnter(bridge);
    expect(tip()?.getAttribute('aria-hidden')).toBeNull();
    const handle = tip();
    if (handle === null) return;
    fireEvent.pointerLeave(bridge, { relatedTarget: handle });
    fireEvent.pointerEnter(handle);
    expect(tip()?.getAttribute('aria-hidden')).toBeNull();
    // Off the stem, onto nothing editable.
    fireEvent.pointerLeave(bridge, { relatedTarget: document.body });
    expect(tip()?.getAttribute('aria-hidden')).toBe('true');
  });

  it('keeps hidden handles from taking the pointer', () => {
    renderCallout({ angle: 90 }, false);
    // Hidden from assistive technologies, which have no name for it.
    const handle = document.querySelector<HTMLElement>(
      '[aria-label="Move what the callout points at"]',
    );
    expect(handle).not.toBeNull();
    if (handle === null) return;
    expect(handle.getAttribute('aria-hidden')).toBe('true');
    expect(handle.style.pointerEvents).toBe('none');
  });

  it('swaps the handles between callouts at once, rather than fading', () => {
    render(
      <Deck>
        <Slide>
          <p>
            {__seminarAt(
              <CalloutDirective with="initial" angle={90}>
                Note
              </CalloutDirective>,
              RANGE,
              FILE,
            )}
            {__seminarAt(
              <CalloutDirective with="initial" angle={-90}>
                Other
              </CalloutDirective>,
              '4:5-4:30',
              FILE,
            )}
          </p>
        </Slide>
      </Deck>,
    );
    const swapped = () =>
      [...document.querySelectorAll('[data-shape="square"]')].map(
        (corner) =>
          `${corner.hasAttribute('data-swapped') ? 'swapped' : 'fading'} ${(corner as HTMLElement).style.opacity}`,
      );
    fireEvent.pointerOver(screen.getByText('Note'));
    expect(new Set(swapped())).toEqual(new Set(['fading 1', 'fading 0']));
    fireEvent.pointerOver(screen.getByText('Other'));
    expect(new Set(swapped())).toEqual(new Set(['swapped 1', 'swapped 0']));
  });

  it('fades hovered handles in and out while another callout is selected', () => {
    render(
      <Deck>
        <Slide>
          <p>
            {__seminarAt(
              <CalloutDirective with="initial" angle={90}>
                Note
              </CalloutDirective>,
              RANGE,
              FILE,
            )}
            {__seminarAt(
              <CalloutDirective with="initial" angle={-90}>
                Other
              </CalloutDirective>,
              '4:5-4:30',
              FILE,
            )}
          </p>
        </Slide>
      </Deck>,
    );
    // Selected, so that its handles stay shown.
    fireEvent.pointerOver(screen.getByText('Note'));
    fireEvent.click(screen.getByText('Note'));
    const corners = (text: string) => cornersOf(text === 'Note' ? 0 : 1);
    const fade = (text: string) => [
      ...new Set(
        corners(text).map(
          (corner) =>
            `${corner.hasAttribute('data-swapped') ? 'swapped' : 'fading'} ${(corner as HTMLElement).style.opacity}`,
        ),
      ),
    ];
    fireEvent.pointerOver(screen.getByText('Other'));
    expect(fade('Other')).toEqual(['swapped 1']);
    // Onto nothing editable.
    fireEvent.pointerOver(screen.getByRole('paragraph'));
    expect(fade('Other')).toEqual(['fading 0']);
    expect(fade('Note')).toEqual(['fading 1']);
    fireEvent.pointerOver(screen.getByText('Other'));
    expect(fade('Other')).toEqual(['fading 1']);
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
    ['bottom right', 50],
    ['top left', -50],
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
