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
import { useResetSlideState, useSlideState } from '../state/useSlideState.ts';
import { useDeckState } from '../state/useDeckState.ts';
import { Step } from '../steps/Step.tsx';
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
  await act(() => vi.advanceTimersByTimeAsync(200));
  for (let count = 0; tasks.size > 0 && count < 20; count += 1) {
    await idle();
    await act(() => vi.advanceTimersByTimeAsync(200));
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
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
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
    vi.useRealTimers();
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

  it('waits for an editing pause before capturing the latest input value', async () => {
    capture.mockImplementation((frame) =>
      Promise.resolve(
        `data:image/png,${frame.querySelector('input')?.value ?? ''}`,
      ),
    );
    render(
      <Deck>
        <Slide>
          <input aria-label="Value" />
        </Slide>
      </Deck>,
    );
    await finish();
    capture.mockClear();
    const input = screen.getByRole('textbox');
    for (const value of ['a', 'ab', 'abc']) {
      fireEvent.input(input, { target: { value } });
      await act(() => vi.advanceTimersByTimeAsync(100));
      await idle();
      expect(capture).not.toHaveBeenCalled();
    }
    await finish();
    expect(capture).toHaveBeenCalledOnce();
    await expect(capture.mock.results[0]?.value).resolves.toBe(
      'data:image/png,abc',
    );
  });

  it('cancels an unfinished capture when local input changes again', async () => {
    render(
      <Deck>
        <Slide>
          <input aria-label="Value" />
        </Slide>
      </Deck>,
    );
    await finish();
    capture.mockClear();
    const pending = Promise.withResolvers<string>();
    let signal: AbortSignal | undefined;
    capture.mockImplementationOnce((_frame, captureSignal) => {
      signal = captureSignal;
      return pending.promise;
    });
    const input = screen.getByRole('textbox');
    fireEvent.input(input, { target: { value: 'Before' } });
    await finish();
    expect(signal?.aborted).toBe(false);
    fireEvent.input(input, { target: { value: 'After' } });
    expect(signal?.aborted).toBe(true);
    pending.resolve('data:image/png,obsolete');
    await finish();
    expect(capture).toHaveBeenCalledTimes(2);
  });

  it('reuses a shown thumbnail across unchanged visits and overview toggles', async () => {
    function Reconstructed(): JSX.Element {
      const [loaded, setLoaded] = useState(false);
      useEffect(() => {
        let mounted = true;
        void Promise.resolve().then(() => {
          if (mounted) setLoaded(true);
        });
        return () => {
          mounted = false;
        };
      }, []);
      return <span>{loaded ? 'Loaded formula' : 'Loading'}</span>;
    }
    render(
      <Deck>
        <Slide title="First">
          <Reconstructed />
        </Slide>
        <Slide title="Second" />
      </Deck>,
    );
    await finish();
    key('PageDown');
    await finish();
    key('PageUp');
    await finish();
    capture.mockClear();
    key('PageDown');
    await finish();
    key('PageUp');
    await finish();
    key('o');
    await finish();
    key('Escape');
    await finish();
    key('PageDown');
    await finish();
    expect(capture).not.toHaveBeenCalled();
  });

  it('recaptures for deck and shared slide state generations, and changed step paths', async () => {
    function State(): JSX.Element {
      const [slide, setSlide] = useSlideState(0);
      const [deck, setDeck] = useDeckState<number>('count');
      return (
        <>
          <button
            onClick={() => {
              setSlide(slide + 1);
            }}
          >
            Slide {slide}
          </button>
          <button
            onClick={() => {
              setDeck((deck ?? 0) + 1);
            }}
          >
            Deck {deck ?? 0}
          </button>
        </>
      );
    }
    render(
      <Deck>
        <Slide title="First">
          <State />
          <Step>Later</Step>
        </Slide>
        <Slide title="Second">
          <State />
        </Slide>
      </Deck>,
    );
    await finish();
    const firstCaptures = () =>
      capture.mock.calls.filter(([frame]) =>
        frame.textContent.includes('First'),
      ).length;
    key('PageDown');
    await finish();
    fireEvent.click(screen.getByRole('button', { name: 'Slide 0' }));
    await finish();
    capture.mockClear();
    key('PageUp');
    await finish();
    // Another slide's private state does not invalidate this one.
    expect(firstCaptures()).toBe(0);
    key('PageDown');
    await finish();
    fireEvent.click(screen.getByRole('button', { name: 'Deck 0' }));
    await finish();
    capture.mockClear();
    key('PageUp');
    await finish();
    expect(firstCaptures()).toBeGreaterThan(0);
    key('PageDown');
    await finish();
    fireEvent.click(screen.getByRole('button', { name: 'Deck 1' }));
    await finish();
    capture.mockClear();
    key('PageUp');
    await finish();
    expect(firstCaptures()).toBeGreaterThan(0);
    capture.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Slide 0' }));
    await finish();
    expect(firstCaptures()).toBeGreaterThan(0);
    capture.mockClear();
    key('ArrowRight');
    await finish();
    expect(firstCaptures()).toBeGreaterThan(0);
    capture.mockClear();
    key('PageDown');
    await finish();
    key('PageUp');
    await finish();
    expect(firstCaptures()).toBe(0);
  });

  it('invalidates recaps for changes and resets of their shared slide state', async () => {
    function Counter(): JSX.Element {
      const [count, setCount] = useSlideState(0);
      const reset = useResetSlideState();
      const { index } = useSlideView();
      return (
        <>
          <button
            data-view-index={index}
            onClick={() => {
              setCount(count + 1);
            }}
          >
            Count {count}
          </button>
          <button onClick={reset}>Reset</button>
        </>
      );
    }
    render(
      <Deck>
        <Slide id="original" title="Original">
          <Counter />
        </Slide>
        <Slide recap="original" />
      </Deck>,
    );
    await finish();
    key('PageDown');
    await finish();
    key('PageUp');
    await finish();
    fireEvent.click(screen.getByRole('button', { name: 'Count 0' }));
    await finish();
    capture.mockClear();
    key('PageDown');
    await finish();
    expect(
      capture.mock.calls.some(
        ([frame]) => frame.querySelector('[data-view-index="1"]') !== null,
      ),
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    await finish();
    capture.mockClear();
    key('PageUp');
    await finish();
    expect(
      capture.mock.calls.some(
        ([frame]) =>
          frame.querySelector('[data-view-index="0"]')?.textContent ===
          'Count 0',
      ),
    ).toBe(true);
  });

  it('restores every captured step path without recapturing while scrolling through steps', async () => {
    render(
      <Deck>
        <Slide title="Steps">
          <Step>
            First step<Step>Nested step</Step>
          </Step>
          <Step>Last step</Step>
        </Slide>
      </Deck>,
    );
    const images: (string | null | undefined)[] = [];
    for (let step = 0; step < 4; step += 1) {
      await finish();
      key('o');
      await finish();
      images.push(image());
      key('Escape');
      await finish();
      if (step < 3) key('ArrowRight');
    }
    expect(new Set(images).size).toBe(4);
    capture.mockClear();
    // Revisit all paths without giving uncached work any idle time.
    for (const direction of [
      'ArrowLeft',
      'ArrowLeft',
      'ArrowLeft',
      'ArrowRight',
      'ArrowRight',
      'ArrowRight',
      'ArrowLeft',
    ])
      key(direction);
    await finish();
    key('o');
    await finish();
    expect(capture).not.toHaveBeenCalled();
    expect(image()).toBe(images[2]);
  });

  it('keeps all step snapshots of a slide that never reads deck state', async () => {
    function Writer(): JSX.Element {
      const [count, setCount] = useDeckState<number>('count');
      return (
        <button
          onClick={() => {
            setCount((count ?? 0) + 1);
          }}
        >
          Deck {count ?? 0}
        </button>
      );
    }
    render(
      <Deck>
        <Slide title="Independent">
          <Step>Later</Step>
        </Slide>
        <Slide title="Writer">
          <Writer />
        </Slide>
      </Deck>,
    );
    await finish();
    key('ArrowRight');
    await finish();
    key('PageDown');
    await finish();
    fireEvent.click(screen.getByRole('button', { name: 'Deck 0' }));
    await finish();
    capture.mockClear();
    key('PageUp');
    await finish();
    key('ArrowLeft');
    await finish();
    expect(
      capture.mock.calls.filter(([frame]) =>
        frame.textContent.includes('Independent'),
      ),
    ).toHaveLength(0);
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
  it('keeps every path only for the current generation and restores the selected image', async () => {
    const cache = new ThumbnailCache();
    const frame = document.createElement('div');
    const first = { generation: '1/2', path: '/audience' };
    const nested = { generation: '1/2', path: '1.1/audience' };
    capture.mockResolvedValueOnce('first').mockResolvedValueOnce('nested');
    await cache.capture(0, frame, true, undefined, first);
    await cache.capture(0, frame, true, undefined, nested);
    const listener = vi.fn();
    cache.subscribe(listener);
    capture.mockClear();
    await cache.capture(0, frame, true, undefined, first);
    expect(cache.get(0)).toBe('first');
    expect(listener).toHaveBeenCalledOnce();
    await cache.capture(0, frame, true, undefined, nested);
    expect(cache.get(0)).toBe('nested');
    expect(capture).not.toHaveBeenCalled();
    cache.invalidate(0, nested);
    expect(cache.isCurrent(0, nested)).toBe(false);
    expect(cache.isCurrent(0, first)).toBe(true);
    const changed = { generation: '1/3', path: first.path };
    capture.mockResolvedValueOnce('changed');
    await cache.capture(0, frame, true, undefined, changed);
    expect(cache.isCurrent(0, first)).toBe(false);
    expect(cache.isCurrent(0, nested)).toBe(false);
    expect(cache.isCurrent(0, changed)).toBe(true);
  });

  it('ignores pending work after restoring an already captured path', async () => {
    const cache = new ThumbnailCache();
    const frame = document.createElement('div');
    const first = { generation: '1/2', path: '/audience' };
    const later = { generation: '1/2', path: '1/audience' };
    capture.mockResolvedValueOnce('first');
    await cache.capture(0, frame, true, undefined, first);
    const deferred = Promise.withResolvers<string>();
    capture.mockReturnValueOnce(deferred.promise);
    const pending = cache.capture(0, frame, true, undefined, later);
    expect(cache.restore(0, first)).toBe(true);
    deferred.resolve('obsolete');
    await pending;
    expect(cache.get(0)).toBe('first');
    expect(cache.isCurrent(0, later)).toBe(false);
  });

  it('reuses only successful captures of the same generations and step path', async () => {
    const cache = new ThumbnailCache();
    const frame = document.createElement('div');
    capture.mockResolvedValueOnce('image');
    await cache.capture(0, frame, true, undefined, {
      generation: '1/2',
      path: '3/audience',
    });
    expect(cache.isCurrent(0, { generation: '1/2', path: '3/audience' })).toBe(
      true,
    );
    capture.mockClear();
    await cache.capture(0, frame, true, undefined, {
      generation: '1/2',
      path: '3/audience',
    });
    expect(capture).not.toHaveBeenCalled();
    capture.mockRejectedValueOnce(new Error('Unavailable'));
    await cache.capture(0, frame, true, undefined, {
      generation: '2/2',
      path: '3/audience',
    });
    expect(cache.isCurrent(0, { generation: '2/2', path: '3/audience' })).toBe(
      false,
    );
    capture.mockResolvedValueOnce('updated');
    await cache.capture(0, frame, true, undefined, {
      generation: '2/2',
      path: '3/audience',
    });
    expect(cache.isCurrent(0, { generation: '2/2', path: '3/audience' })).toBe(
      true,
    );
    expect(cache.get(0)).toBe('updated');
  });

  it('does not mark canceled or invalidated work as current', async () => {
    const cache = new ThumbnailCache();
    const frame = document.createElement('div');
    const controller = new AbortController();
    const canceled = Promise.withResolvers<string>();
    capture.mockReturnValueOnce(canceled.promise);
    const pending = cache.capture(0, frame, true, controller.signal, {
      generation: '0/0',
      path: '/audience',
    });
    controller.abort();
    canceled.resolve('canceled');
    await pending;
    expect(cache.isCurrent(0, { generation: '0/0', path: '/audience' })).toBe(
      false,
    );
    const stale = Promise.withResolvers<string>();
    capture.mockReturnValueOnce(stale.promise);
    const invalidated = cache.capture(0, frame, true, undefined, {
      generation: '0/0',
      path: '/audience',
    });
    cache.invalidate(0);
    stale.resolve('stale');
    await invalidated;
    expect(cache.isCurrent(0, { generation: '0/0', path: '/audience' })).toBe(
      false,
    );
    expect(cache.get(0)).toBeUndefined();
  });

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
