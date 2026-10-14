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
