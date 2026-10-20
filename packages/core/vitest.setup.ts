import { vi } from 'vitest';
import type * as ThumbnailCapture from './src/overview/captureThumbnail.ts';

// jsdom cannot rasterize DOM nodes. Thumbnail behavior is tested separately.
vi.mock('./src/overview/captureThumbnail.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof ThumbnailCapture>()),
  captureThumbnail: vi.fn((frame: HTMLElement) =>
    Promise.resolve(`data:image/png,${encodeURIComponent(frame.innerHTML)}`),
  ),
}));

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

// jsdom does not implement pointer capture.
Element.prototype.setPointerCapture = () => undefined;
Element.prototype.releasePointerCapture = () => undefined;
Element.prototype.hasPointerCapture = () => false;
