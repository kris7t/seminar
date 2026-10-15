import { vi } from 'vitest';

// jsdom does not implement layout, so ResizeObserver is missing.
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe(): void {
      // No layout to observe.
    }
    unobserve(): void {
      // No layout to observe.
    }
    disconnect(): void {
      // No layout to observe.
    }
  },
);

// jsdom does not implement scrolling.
Element.prototype.scrollIntoView = () => undefined;

// jsdom does not implement media queries.
window.matchMedia = (query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }) as MediaQueryList;
