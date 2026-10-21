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
import { DeckStateStore } from '../state/DeckStateStore.ts';
import { SlideStateStore } from '../state/SlideStateStore.ts';
import { useDeckState } from '../state/useDeckState.ts';
import { createSlideTheme } from '../theme/createSlideTheme.ts';
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

  it('reuses captured step paths after transient state resets and reconstructs on another visit', async () => {
    function Mirrored(): JSX.Element {
      const [value, setValue] = useSlideState(0, { transient: true });
      useEffect(() => {
        setValue((previous) => previous + 1);
      }, [setValue]);
      return <span>Mirror {value}</span>;
    }
    render(
      <Deck>
        <Slide title="First">
          <Mirrored />
          <Step>Later</Step>
        </Slide>
        <Slide title="Second" />
      </Deck>,
    );
    await finish();
    key('ArrowRight');
    await finish();
    key('ArrowLeft');
    await finish();
    key('PageDown');
    await finish();
    capture.mockClear();
    key('PageUp');
    await finish();
    expect(screen.getByText('Mirror 1')).toBeDefined();
    key('ArrowRight');
    await finish();
    expect(
      capture.mock.calls.filter(([frame]) =>
        frame.textContent.includes('First'),
      ),
    ).toHaveLength(0);
  });

  it('recaptures for changed deck and shared slide state, and changed step paths', async () => {
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

  it('refreshes only thumbnails that read a changed deck-state key, including shown slides', async () => {
    function Value({ name }: { name: string }): JSX.Element {
      const [value, setValue] = useDeckState<number>(name);
      return (
        <button
          onClick={() => {
            setValue((value ?? 0) + 1);
          }}
        >
          {name} {value ?? 0}
        </button>
      );
    }
    render(
      <Deck>
        <Slide title="Writer">
          <Value name="a" />
          <Value name="b" />
        </Slide>
        <Slide title="Reads A">
          <Value name="a" />
          <Step>Later</Step>
        </Slide>
        <Slide title="Reads B">
          <Value name="b" />
        </Slide>
        <Slide title="Independent" />
      </Deck>,
    );
    await finish();
    // Include a previously shown slide, with multiple captured step paths.
    key('PageDown');
    await finish();
    key('ArrowRight');
    await finish();
    key('PageDown');
    await finish();
    key('Home');
    await finish();
    capture.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'a 0' }));
    await finish();
    const backgrounds = capture.mock.calls.filter(
      ([frame]) => frame.dataset['seminarView'] === 'thumbnail',
    );
    expect(backgrounds).toHaveLength(1);
    expect(backgrounds[0]?.[0].textContent).toContain('Reads A');
    expect(backgrounds[0]?.[0].textContent).toContain('a 1');
    expect(
      capture.mock.calls.some(
        ([frame]) =>
          frame.dataset['seminarView'] !== 'thumbnail' &&
          frame.textContent.includes('Writer'),
      ),
    ).toBe(true);
    capture.mockClear();
    key('End');
    await finish();
    key('PageUp');
    await finish();
    key('Home');
    await finish();
    expect(
      capture.mock.calls.filter(([frame]) =>
        frame.textContent.includes('Reads B'),
      ),
    ).toHaveLength(0);
  });

  it('refreshes unmounted original and recap thumbnails after slide state changes and resets', async () => {
    function Counter(): JSX.Element {
      const [value, setValue] = useSlideState(0);
      const reset = useResetSlideState();
      return (
        <>
          <button
            onClick={() => {
              setValue(value + 1);
            }}
          >
            Value {value}
          </button>
          <button onClick={reset}>Reset value</button>
        </>
      );
    }
    render(
      <Deck>
        <Slide id="source" title="Shared">
          <Counter />
        </Slide>
        <Slide recap="source" />
        <Slide title="Independent" />
      </Deck>,
    );
    await finish();
    key('PageDown');
    await finish();
    capture.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Value 0' }));
    await finish();
    const backgrounds = () =>
      capture.mock.calls.filter(
        ([frame]) => frame.dataset['seminarView'] === 'thumbnail',
      );
    expect(backgrounds()).toHaveLength(1);
    expect(backgrounds()[0]?.[0].textContent).toContain('Value 1');
    capture.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Reset value' }));
    await finish();
    expect(backgrounds()).toHaveLength(1);
    expect(backgrounds()[0]?.[0].textContent).toContain('Value 0');
  });

  it('keeps stale previews visible through invalidation and superseded background captures', async () => {
    let change: ((value: number) => void) | undefined;
    function Value(): JSX.Element {
      const [value, setValue] = useDeckState<number>('value');
      const { interactive } = useSlideView();
      useEffect(() => {
        if (interactive) change = setValue;
      }, [interactive, setValue]);
      return <span>Value {value ?? 0}</span>;
    }
    render(
      <Deck>
        <Slide title="Writer">
          <Value />
        </Slide>
        <Slide title="Reader">
          <Value />
        </Slide>
      </Deck>,
    );
    await finish();
    key('o');
    await finish();
    const stale = image(1);
    expect(stale).toBeDefined();
    const first = Promise.withResolvers<string>();
    const second = Promise.withResolvers<string>();
    let replacement = first;
    capture.mockImplementation((frame) =>
      frame.dataset['seminarView'] === 'thumbnail'
        ? replacement.promise
        : Promise.resolve(
            `data:image/png,${encodeURIComponent(frame.innerHTML)}`,
          ),
    );
    act(() => {
      change?.(1);
    });
    expect(image(1)).toBe(stale);
    await finish();
    const firstJob = capture.mock.calls.at(-1);
    expect(firstJob?.[0].textContent).toContain('Reader');
    expect(image(1)).toBe(stale);
    replacement = second;
    act(() => {
      change?.(2);
    });
    await finish();
    expect(firstJob?.[1]?.aborted).toBe(true);
    expect(capture.mock.calls.at(-1)?.[0].textContent).toContain('Value 2');
    expect(image(1)).toBe(stale);
    await act(async () => {
      first.resolve('data:image/png,obsolete');
      await first.promise;
    });
    expect(image(1)).toBe(stale);
    await act(async () => {
      second.resolve('data:image/png,updated');
      await second.promise;
    });
    expect(image(1)).toBe('data:image/png,updated');
    expect(decodeURIComponent(image(0) ?? '')).toContain('Value 2');
    capture.mockImplementation((frame) =>
      frame.dataset['seminarView'] === 'thumbnail'
        ? Promise.reject(new Error('Unavailable'))
        : Promise.resolve(
            `data:image/png,${encodeURIComponent(frame.innerHTML)}`,
          ),
    );
    act(() => {
      change?.(3);
    });
    await finish();
    expect(image(1)).toBe('data:image/png,updated');
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

  it('pauses background rendering for a departing capture and resumes near the new slide', async () => {
    const foreground = Promise.withResolvers<string>();
    const background = Promise.withResolvers<string>();
    capture.mockImplementation((frame) =>
      frame.dataset['seminarView'] === 'thumbnail'
        ? background.promise
        : foreground.promise,
    );
    render(
      <Deck>
        <Slide title="First" />
        <Slide title="Second" />
        <Slide title="Third" />
        <Slide title="Fourth" />
      </Deck>,
    );
    await idle();
    await idle();
    const backgroundJob = capture.mock.calls.find(
      ([frame]) => frame.dataset['seminarView'] === 'thumbnail',
    );
    expect(backgroundJob?.[0].textContent).toContain('Second');
    key('End');
    expect(screen.getByRole('heading', { name: 'Fourth' })).toBeDefined();
    expect(backgroundJob?.[1]?.aborted).toBe(true);
    expect(
      document.querySelector('[data-seminar-view="thumbnail"]'),
    ).toBeNull();
    await idle();
    expect(
      capture.mock.calls.filter(
        ([frame]) => frame.dataset['seminarView'] === 'thumbnail',
      ),
    ).toHaveLength(1);
    await act(async () => {
      foreground.resolve('data:image/png,first');
      await foreground.promise;
    });
    await idle();
    await idle();
    expect(capture.mock.calls.at(-1)?.[0].textContent).toContain('Third');
  });

  it('uses the probed master background while a thumbnail capture is pending', async () => {
    const pending = Promise.withResolvers<string>();
    capture.mockReturnValue(pending.promise);
    const theme = createSlideTheme({
      components: {
        SeminarSectionMaster: {
          styleOverrides: { root: { backgroundColor: '#123456' } },
        },
      },
    });
    render(
      <Deck theme={theme}>
        <Slide title="First" />
        <Slide master="section" title="Colored" lang="hu" />
      </Deck>,
    );
    key('o');
    await idle();
    const frames = screen
      .getByRole('region')
      .querySelectorAll('[data-seminar-view="thumbnail"]');
    expect(frames).toHaveLength(2);
    expect(frames[1] && getComputedStyle(frames[1]).backgroundImage).toContain(
      'rgb(18, 52, 86)',
    );
    expect(screen.getByRole('region').querySelector('img')).toBeNull();
  });

  it('prioritizes visible overview thumbnails and preempts work scrolled off screen', async () => {
    const originalObserver = globalThis.IntersectionObserver;
    let callback: IntersectionObserverCallback | undefined;
    let options: IntersectionObserverInit | undefined;
    const observer = {
      root: null,
      rootMargin: '0px',
      scrollMargin: '0px',
      thresholds: [0],
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
      takeRecords: () => [],
    } satisfies IntersectionObserver;
    vi.stubGlobal(
      'IntersectionObserver',
      vi.fn(function (
        onEntries: IntersectionObserverCallback,
        init: IntersectionObserverInit,
      ) {
        callback = onEntries;
        options = init;
        return observer;
      }),
    );
    try {
      const foreground = Promise.withResolvers<string>();
      const background = Promise.withResolvers<string>();
      capture.mockImplementation((frame) =>
        frame.dataset['seminarView'] === 'thumbnail'
          ? background.promise
          : foreground.promise,
      );
      const { unmount } = render(
        <Deck>
          {Array.from({ length: 8 }, (_, index) => (
            <Slide key={index} title={`Slide ${String(index + 1)}`} />
          ))}
        </Deck>,
      );
      key('o');
      const region = screen.getByRole('region');
      const frames = region.querySelectorAll('[data-seminar-view="thumbnail"]');
      expect(options?.root).toBe(region);
      expect(observer.observe).toHaveBeenCalledTimes(8);
      act(() => {
        callback?.(
          [
            {
              target: frames[4],
              isIntersecting: true,
            } as IntersectionObserverEntry,
            {
              target: frames[5],
              isIntersecting: true,
            } as IntersectionObserverEntry,
          ],
          observer,
        );
      });
      await act(async () => {
        foreground.resolve('data:image/png,first');
        await foreground.promise;
      });
      await idle();
      await idle();
      const firstJob = capture.mock.calls.at(-1);
      expect(firstJob?.[0].textContent).toContain('Slide 5');
      act(() => {
        callback?.(
          [
            {
              target: frames[4],
              isIntersecting: false,
            } as IntersectionObserverEntry,
            {
              target: frames[5],
              isIntersecting: false,
            } as IntersectionObserverEntry,
            {
              target: frames[2],
              isIntersecting: true,
            } as IntersectionObserverEntry,
          ],
          observer,
        );
      });
      expect(firstJob?.[1]?.aborted).toBe(true);
      await idle();
      await idle();
      expect(capture.mock.calls.at(-1)?.[0].textContent).toContain('Slide 3');
      unmount();
      expect(observer.disconnect).toHaveBeenCalledOnce();
    } finally {
      vi.stubGlobal('IntersectionObserver', originalObserver);
    }
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
  it('invalidates only recorded dependencies, batching deck resets and stopping on cleanup', () => {
    const cache = new ThumbnailCache();
    const deck = new DeckStateStore();
    const slides = new SlideStateStore();
    cache.recordDeckStateUse(0, 'a');
    cache.recordDeckStateUse(0, 'b');
    cache.recordDeckStateUse(1, 'b');
    cache.recordDeckStateUse(2, 'unset');
    cache.recordSlideStateUse(0, 0);
    cache.recordSlideStateUse(3, 0);
    const listeners = Array.from({ length: 4 }, () => vi.fn());
    listeners.forEach((listener, index) => {
      cache.subscribeInvalidation(index, listener);
    });
    const stop = cache.observe(deck, slides);
    deck.set('unread', 1);
    expect(
      listeners.every((listener) => listener.mock.calls.length === 0),
    ).toBe(true);
    deck.set('a', 1);
    expect(listeners[0]).toHaveBeenCalledOnce();
    expect(listeners[1]).not.toHaveBeenCalled();
    deck.set('a', 1);
    deck.set('b', 2);
    expect(listeners[0]).toHaveBeenCalledTimes(2);
    expect(listeners[1]).toHaveBeenCalledOnce();
    deck.reset();
    expect(listeners[0]).toHaveBeenCalledTimes(3);
    expect(listeners[1]).toHaveBeenCalledTimes(2);
    expect(listeners[2]).not.toHaveBeenCalled();
    slides.getOrInit(0, 'value', () => 0);
    slides.getOrInit(0, 'mirror', () => 0, true);
    slides.stepPosition(0).set({ path: [1], toEnd: false });
    slides.set(0, 'mirror', 1);
    expect(listeners[0]).toHaveBeenCalledTimes(3);
    slides.set(0, 'value', 1);
    expect(listeners[0]).toHaveBeenCalledTimes(4);
    expect(listeners[3]).toHaveBeenCalledOnce();
    stop();
    deck.set('a', 2);
    slides.resetAll();
    expect(listeners[0]).toHaveBeenCalledTimes(4);
    expect(listeners[3]).toHaveBeenCalledOnce();
  });

  it('queues previously shown slides after invalidation once all live views leave', async () => {
    const cache = new ThumbnailCache();
    capture.mockResolvedValue('last image');
    const leaveAudience = cache.shown(0);
    const leavePresenter = cache.shown(0);
    await cache.capture(0, document.createElement('div'), true, undefined, {
      path: '/audience',
    });
    cache.invalidate(0);
    expect(cache.get(0)).toBe('last image');
    expect(cache.nextMissing(1)).toBeUndefined();
    leaveAudience();
    expect(cache.nextMissing(1)).toBeUndefined();
    leavePresenter();
    expect(cache.nextMissing(1)).toBe(0);
  });

  it('captures visible slides before nearer off-screen slides', () => {
    const cache = new ThumbnailCache();
    cache.shown(0);
    cache.setVisible([5, 6]);
    expect(cache.nextMissing(8, 6)).toBe(6);
    expect(cache.nextMissing(8, 1)).toBe(5);
    cache.skip(5);
    expect(cache.nextMissing(8, 1)).toBe(6);
    cache.skip(6);
    expect(cache.nextMissing(8, 1)).toBe(1);
    cache.setVisible([3]);
    expect(cache.nextMissing(8, 1)).toBe(3);
    cache.setVisible([]);
    expect(cache.nextMissing(8, 1)).toBe(1);
  });

  it('releases foreground priority on cancellation without waiting for the rasterizer', async () => {
    const cache = new ThumbnailCache();
    const pending = Promise.withResolvers<string>();
    capture.mockReturnValueOnce(pending.promise);
    const controller = new AbortController();
    const work = cache.capture(
      0,
      document.createElement('div'),
      true,
      controller.signal,
    );
    expect(cache.isCapturingShown()).toBe(true);
    expect(cache.nextMissing(2)).toBeUndefined();
    controller.abort();
    expect(cache.isCapturingShown()).toBe(false);
    expect(cache.nextMissing(2, 1)).toBe(1);
    pending.resolve('obsolete');
    await work;
    expect(cache.get(0)).toBeUndefined();
  });

  it('fills missing thumbnails near the selected slide, preferring forward ties', () => {
    const cache = new ThumbnailCache();
    cache.shown(3);
    expect(cache.nextMissing(6, 3)).toBe(4);
    cache.skip(4);
    expect(cache.nextMissing(6, 3)).toBe(2);
    cache.skip(2);
    expect(cache.nextMissing(6, 3)).toBe(5);
    cache.skip(5);
    expect(cache.nextMissing(6, 3)).toBe(1);
  });

  it('preempts background captures for shown slides and retries the canceled work', async () => {
    const cache = new ThumbnailCache();
    const pending = Promise.withResolvers<string>();
    capture.mockReturnValueOnce(pending.promise).mockResolvedValueOnce('shown');
    const background = cache.capture(2, document.createElement('div'));
    const signal = capture.mock.calls.at(-1)?.[1];
    await cache.capture(0, document.createElement('div'), true);
    expect(signal?.aborted).toBe(true);
    pending.resolve('obsolete');
    await background;
    expect(cache.get(2)).toBeUndefined();
    expect(cache.nextMissing(3, 2)).toBe(2);
  });

  it('keeps every path until invalidation and restores the selected image', async () => {
    const cache = new ThumbnailCache();
    const frame = document.createElement('div');
    const first = { path: '/audience' };
    const nested = { path: '1.1/audience' };
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
    cache.invalidate(0);
    expect(cache.isCurrent(0, first)).toBe(false);
    const changed = { path: first.path };
    capture.mockResolvedValueOnce('changed');
    await cache.capture(0, frame, true, undefined, changed);
    expect(cache.isCurrent(0, first)).toBe(true);
    expect(cache.isCurrent(0, nested)).toBe(false);
    expect(cache.isCurrent(0, changed)).toBe(true);
  });

  it('ignores pending work after restoring an already captured path', async () => {
    const cache = new ThumbnailCache();
    const frame = document.createElement('div');
    const first = { path: '/audience' };
    const later = { path: '1/audience' };
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

  it('reuses only successful captures of valid step paths', async () => {
    const cache = new ThumbnailCache();
    const frame = document.createElement('div');
    capture.mockResolvedValueOnce('image');
    await cache.capture(0, frame, true, undefined, {
      path: '3/audience',
    });
    expect(cache.isCurrent(0, { path: '3/audience' })).toBe(true);
    capture.mockClear();
    await cache.capture(0, frame, true, undefined, {
      path: '3/audience',
    });
    expect(capture).not.toHaveBeenCalled();
    cache.invalidate(0);
    capture.mockRejectedValueOnce(new Error('Unavailable'));
    await cache.capture(0, frame, true, undefined, {
      path: '3/audience',
    });
    expect(cache.isCurrent(0, { path: '3/audience' })).toBe(false);
    capture.mockResolvedValueOnce('updated');
    await cache.capture(0, frame, true, undefined, {
      path: '3/audience',
    });
    expect(cache.isCurrent(0, { path: '3/audience' })).toBe(true);
    expect(cache.get(0)).toBe('updated');
  });

  it('does not mark canceled or invalidated work as current', async () => {
    const cache = new ThumbnailCache();
    const frame = document.createElement('div');
    const controller = new AbortController();
    const canceled = Promise.withResolvers<string>();
    capture.mockReturnValueOnce(canceled.promise);
    const pending = cache.capture(0, frame, true, controller.signal, {
      path: '/audience',
    });
    controller.abort();
    canceled.resolve('canceled');
    await pending;
    expect(cache.isCurrent(0, { path: '/audience' })).toBe(false);
    const stale = Promise.withResolvers<string>();
    capture.mockReturnValueOnce(stale.promise);
    const invalidated = cache.capture(0, frame, true, undefined, {
      path: '/audience',
    });
    cache.invalidate(0);
    stale.resolve('stale');
    await invalidated;
    expect(cache.isCurrent(0, { path: '/audience' })).toBe(false);
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
