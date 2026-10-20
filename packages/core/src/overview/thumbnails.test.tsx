import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { useEffect, useState, type JSX } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Deck } from '../deck/Deck.tsx';
import { Slide } from '../slide/Slide.tsx';
import { useSlideView } from '../view/SlideViewContext.ts';
import { captureThumbnail } from './captureThumbnail.ts';
import { ThumbnailCache } from './ThumbnailCache.ts';
import { ThumbnailRenderer } from './ThumbnailRenderer.tsx';
import {
  SlideTransitions,
  SlideTransitionsContext,
} from '../transitions/SlideTransitions.ts';
import { useTransitionHold } from '../transitions/settling.ts';

const capture = vi.mocked(captureThumbnail);
const tasks = new Map<number, IdleRequestCallback>();
let nextTask = 0;

async function idle(): Promise<void> {
  await act(async () => {
    const batch = [...tasks.values()];
    tasks.clear();
    for (const task of batch) {
      task({ didTimeout: false, timeRemaining: () => 50 });
    }
    await Promise.resolve();
  });
}

async function finish(): Promise<void> {
  for (let count = 0; tasks.size > 0 && count < 20; count += 1) {
    await idle();
  }
  expect(tasks.size).toBe(0);
}

function key(key: string): void {
  fireEvent.keyDown(document, { key });
}

function image(index = 0): string | null | undefined {
  return screen
    .getByRole('region', { name: 'Slide overview' })
    .querySelectorAll('img')
    [index]?.getAttribute('src');
}

describe('cached slide thumbnails', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '#');
    vi.stubGlobal('requestIdleCallback', (callback: IdleRequestCallback) => {
      const handle = ++nextTask;
      tasks.set(handle, callback);
      return handle;
    });
    vi.stubGlobal('cancelIdleCallback', (handle: number) => {
      tasks.delete(handle);
    });
    capture.mockClear();
  });

  afterEach(() => {
    cleanup();
    tasks.clear();
    vi.restoreAllMocks();
    vi.stubGlobal('requestIdleCallback', undefined);
    vi.stubGlobal('cancelIdleCallback', undefined);
    capture.mockReset();
    capture.mockImplementation((frame) =>
      Promise.resolve(`data:image/png,${encodeURIComponent(frame.innerHTML)}`),
    );
  });

  it('renders unvisited slides one at a time and reuses them when reopening', async () => {
    const mounted: number[] = [];
    const active = new Set<number>();
    function Tracked(): JSX.Element {
      const { kind, index } = useSlideView();
      useEffect(() => {
        if (kind === 'thumbnail') {
          mounted.push(index);
          active.add(index);
          expect(active.size).toBe(1);
          return () => {
            active.delete(index);
          };
        }
        return undefined;
      }, [kind, index]);
      return <span>Content {index}</span>;
    }
    render(
      <Deck>
        {[0, 1, 2, 3].map((index) => (
          <Slide key={index} title={`Title ${String(index)}`}>
            <Tracked />
          </Slide>
        ))}
      </Deck>,
    );
    expect(mounted).toEqual([]);
    key('o');
    expect(
      within(screen.getByRole('region')).getAllByRole('button'),
    ).toHaveLength(4);
    expect(mounted).toEqual([]);
    await finish();
    expect(mounted).toEqual([1, 2, 3]);
    expect(active.size).toBe(0);
    expect(screen.getByRole('region').querySelectorAll('img')).toHaveLength(4);
    key('Escape');
    key('o');
    await finish();
    expect(mounted).toEqual([1, 2, 3]);
  });

  it('updates a visible slide after DOM and input changes, and captures immediately on leaving', async () => {
    function Counter(): JSX.Element {
      const [count, setCount] = useState(0);
      return (
        <button
          data-seminar-interactive
          onClick={() => {
            setCount(count + 1);
          }}
        >
          Count {count}
        </button>
      );
    }
    render(
      <Deck>
        <Slide>
          <Counter />
          <input aria-label="Value" />
        </Slide>
        <Slide title="Next" />
      </Deck>,
    );
    await finish();
    expect(capture).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Count 0' }));
    await act(() => Promise.resolve());
    await finish();
    await expect(capture.mock.results.at(-1)?.value).resolves.toContain(
      encodeURIComponent('Count 1'),
    );
    const calls = capture.mock.calls.length;
    fireEvent.input(screen.getByRole('textbox'), {
      target: { value: 'Changed' },
    });
    await finish();
    expect(capture.mock.calls.length).toBeGreaterThan(calls);
    fireEvent.click(screen.getByRole('button', { name: 'Count 1' }));
    // No idle time between the edit and opening the overview.
    key('o');
    await act(() => Promise.resolve());
    expect(decodeURIComponent(image() ?? '')).toContain('Count 2');
    expect(
      within(screen.getByRole('region')).queryByText('Count 2'),
    ).toBeNull();
  });

  it('cancels background work when the deck unmounts', async () => {
    const { unmount } = render(
      <Deck>
        <Slide />
        <Slide />
        <Slide />
      </Deck>,
    );
    expect(tasks.size).toBeGreaterThan(0);
    unmount();
    await act(() => Promise.resolve());
    expect(tasks.size).toBe(0);
  });

  it('keeps background loading from holding the presented slide’s transitions', async () => {
    const transitions = new SlideTransitions();
    const hold = vi.spyOn(transitions, 'hold');
    function Loading(): JSX.Element {
      useTransitionHold(true);
      return <span>Loading</span>;
    }
    render(
      <SlideTransitionsContext value={transitions}>
        <ThumbnailRenderer
          cache={new ThumbnailCache()}
          slides={[<Loading key="loading" />]}
          shownIndex={undefined}
        />
      </SlideTransitionsContext>,
    );
    await finish();
    expect(hold).not.toHaveBeenCalled();
  });

  it('stops rendering a background slide when it is shown', async () => {
    render(
      <Deck>
        <Slide title="First" />
        <Slide title="Second" />
      </Deck>,
    );
    // Mount the second slide in the background, before its capture is due.
    await idle();
    expect(
      document.querySelector('[data-seminar-view="thumbnail"]'),
    ).not.toBeNull();
    key('PageDown');
    expect(screen.getAllByText('Second')).toHaveLength(1);
    expect(
      document.querySelector('[data-seminar-view="thumbnail"]'),
    ).toBeNull();
    await finish();
    key('o');
    await act(() => Promise.resolve());
    expect(decodeURIComponent(image(0) ?? '')).toContain('First');
    expect(decodeURIComponent(image(1) ?? '')).toContain('Second');
  });

  it('invalidates cached images when the deck is edited', async () => {
    const { rerender } = render(
      <Deck>
        <Slide title="First" />
        <Slide title="Old" />
      </Deck>,
    );
    await finish();
    key('o');
    expect(decodeURIComponent(image(1) ?? '')).toContain('Old');
    rerender(
      <Deck>
        <Slide title="First" />
        <Slide title="New" />
        <Slide title="Added" />
      </Deck>,
    );
    expect(image(1)).toBeUndefined();
    await finish();
    expect(decodeURIComponent(image(1) ?? '')).toContain('New');
    expect(decodeURIComponent(image(2) ?? '')).toContain('Added');
  });

  it('keeps generating thumbnails after a capture fails', async () => {
    capture.mockImplementation((frame) =>
      frame.textContent.includes('Broken')
        ? Promise.reject(new Error('Cross-origin media'))
        : Promise.resolve(
            `data:image/png,${encodeURIComponent(frame.innerHTML)}`,
          ),
    );
    render(
      <Deck>
        <Slide title="First" />
        <Slide title="Broken" />
        <Slide title="Last" />
      </Deck>,
    );
    await finish();
    key('o');
    await act(() => Promise.resolve());
    const images = [...screen.getByRole('region').querySelectorAll('img')].map(
      (element) => decodeURIComponent(element.src),
    );
    expect(images.some((src) => src.includes('Last'))).toBe(true);
    expect(images.some((src) => src.includes('Broken'))).toBe(false);
  });

  it.each(['throws', 'suspends'])(
    'skips a slide that %s while rendering its thumbnail',
    async (failure) => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const pending = Promise.withResolvers<never>();
      function Unavailable(): JSX.Element {
        if (useSlideView().kind === 'thumbnail') {
          if (failure === 'throws') {
            throw new Error('Unavailable in thumbnail views');
          }
          // React suspends by throwing the pending promise.
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw pending.promise;
        }
        return <span>Available when shown</span>;
      }
      render(
        <Deck>
          <Slide title="First" />
          <Slide title="Skipped">
            <Unavailable />
          </Slide>
          <Slide title="Last" />
        </Deck>,
      );
      await finish();
      key('o');
      await act(() => Promise.resolve());
      const images = [
        ...screen.getByRole('region').querySelectorAll('img'),
      ].map((element) => decodeURIComponent(element.src));
      expect(images.some((src) => src.includes('Last'))).toBe(true);
      expect(images.some((src) => src.includes('Skipped'))).toBe(false);
    },
  );
});

describe('ThumbnailCache', () => {
  it('ignores stale captures that finish after a newer capture', async () => {
    const cache = new ThumbnailCache();
    const older = Promise.withResolvers<string>();
    capture.mockReturnValueOnce(older.promise).mockResolvedValueOnce('new');
    const pending = cache.capture(0, document.createElement('div'));
    cache.shown(0);
    await cache.capture(0, document.createElement('div'), true);
    older.resolve('old');
    await pending;
    expect(cache.get(0)).toBe('new');
  });

  it('keeps the last image on failure and never replaces a shown slide in the background', async () => {
    const cache = new ThumbnailCache();
    const frame = document.createElement('div');
    capture.mockResolvedValueOnce('shown');
    cache.shown(0);
    await cache.capture(0, frame, true);
    capture.mockRejectedValueOnce(new Error('Unavailable'));
    await cache.capture(0, frame, true);
    await cache.capture(0, frame);
    expect(cache.get(0)).toBe('shown');
    expect(cache.nextMissing(2)).toBe(1);
  });
});
