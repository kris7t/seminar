// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { sidebarHtml } from './sidebarPage.ts';

function element(parent: ParentNode, selector: string): HTMLElement {
  const found = parent.querySelector<HTMLElement>(selector);
  if (found === null) {
    throw new Error(`There is no ${selector}.`);
  }
  return found;
}

/** Loads the page with 100px in view of the height `scrollHeight`. */
function page(scrollHeight: number) {
  const { body } = new DOMParser().parseFromString(
    sidebarHtml('abc'),
    'text/html',
  );
  const script = element(body, 'script');
  script.remove();
  document.body.replaceChildren(...body.children);

  const root = document.documentElement;
  root.scrollTop = 0;
  Object.defineProperty(root, 'scrollHeight', {
    value: scrollHeight,
    configurable: true,
  });
  Object.defineProperty(root, 'clientHeight', {
    value: 100,
    configurable: true,
  });
  // In the globals of the test, where its stubs and fake timers are, and in a
  // function, because the pages of a test share them.
  globalThis.eval(`(() => {${script.textContent}})();`);

  const scrollbar = element(document, '#scrollbar');
  const slider = element(document, '#slider');
  scrollbar.setPointerCapture = () => undefined;
  const mouse = (type: string) => {
    root.dispatchEvent(new MouseEvent(type));
  };
  const scroll = (top: number) => {
    root.scrollTop = top;
    window.dispatchEvent(new Event('scroll'));
  };
  return { root, scrollbar, slider, mouse, scroll };
}

describe('the scrollbar of a sidebar page', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('acquireVsCodeApi', () => ({
      postMessage: () => undefined,
    }));
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {
          return undefined;
        }
      },
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('takes no space, and shows only if there is something to scroll', () => {
    expect(page(100).scrollbar.hidden).toBe(true);
    const { scrollbar, slider } = page(400);
    expect(scrollbar.hidden).toBe(false);
    expect(scrollbar.className).toBe('invisible');
    expect(slider.style.height).toBe('25px');
    expect(sidebarHtml('abc')).toContain('scrollbar-width: none');
  });

  it('places the slider by the scroll position, with a minimum size', () => {
    const { slider, scroll } = page(10000);
    expect(slider.style.height).toBe('20px');
    scroll(9900);
    expect(slider.style.top).toBe('80px');
  });

  it('shows while the mouse is over the page, then fades', () => {
    const { scrollbar, mouse } = page(400);
    mouse('pointermove');
    expect(scrollbar.className).toBe('visible');
    vi.advanceTimersByTime(5000);
    expect(scrollbar.className).toBe('visible');
    mouse('mouseleave');
    expect(scrollbar.className).toBe('invisible fade');
  });

  it('shows for a moment when scrolled without the mouse', () => {
    const { scrollbar, scroll } = page(400);
    scroll(50);
    expect(scrollbar.className).toBe('visible');
    vi.advanceTimersByTime(499);
    expect(scrollbar.className).toBe('visible');
    vi.advanceTimersByTime(1);
    expect(scrollbar.className).toBe('invisible fade');
  });

  it('scrolls with the slider and the track, and stays while dragged', () => {
    const { root, scrollbar, slider, mouse } = page(400);
    const pointer = (type: string, clientY: number) => {
      scrollbar.dispatchEvent(
        new MouseEvent(type, { bubbles: true, clientY, button: 0 }),
      );
    };
    vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, 10, 25),
    );

    mouse('pointermove');
    pointer('pointerdown', 50);
    // The track centers the slider at the mouse: (50 - 12.5) of 75 is half.
    expect(root.scrollTop).toBe(150);
    expect(slider.className).toBe('active');
    pointer('pointermove', 87.5);
    expect(root.scrollTop).toBe(300);
    expect(scrollbar.className).toBe('visible');

    // Ending outside the page, which sends nothing about the mouse leaving.
    scrollbar.dispatchEvent(
      new MouseEvent('lostpointercapture', { clientX: 5000 }),
    );
    expect(slider.className).toBe('');
    vi.advanceTimersByTime(500);
    expect(scrollbar.className).toBe('invisible fade');

    pointer('pointermove', 50);
    expect(root.scrollTop).toBe(300);
    expect(scrollbar.className).toBe('visible');
  });

  it('stays after a drag that ends with the mouse over the page', () => {
    const { scrollbar, slider, mouse } = page(400);
    mouse('pointermove');
    slider.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true, button: 0 }),
    );
    scrollbar.dispatchEvent(
      new MouseEvent('lostpointercapture', { clientX: 5, clientY: 5 }),
    );
    vi.advanceTimersByTime(5000);
    expect(scrollbar.className).toBe('visible');
  });
});
