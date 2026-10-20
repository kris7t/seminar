import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { StrictMode, Suspense, use, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Deck } from '../deck/Deck.tsx';
import { useDeck } from '../deck/DeckContext.ts';
import { Slide } from '../slide/Slide.tsx';
import {
  SlideTransitions,
  SlideTransitionsContext,
} from '../transitions/SlideTransitions.ts';
import { SlideViewProvider } from '../view/SlideViewProvider.tsx';
import type { SlideViewKind } from '../view/SlideViewContext.ts';
import { defineCache, defineResource } from './definitions.ts';
import { SharedWorkProvider } from './SharedWorkProvider.tsx';
import { SharedWorkStore } from './SharedWorkStore.ts';
import { useCached, useResource } from './useSharedWork.ts';
import * as thumbnailIdle from '../overview/whenIdle.ts';

function View({
  index = 0,
  kind = 'audience',
  children,
}: {
  index?: number;
  kind?: SlideViewKind;
  children?: ReactNode;
}) {
  return (
    <SlideViewProvider view={{ index, kind, interactive: kind === 'audience' }}>
      {children}
    </SlideViewProvider>
  );
}

async function flush(action: () => void): Promise<void> {
  await act(async () => {
    action();
    await Promise.resolve();
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('shared resources and caches', () => {
  it('does not start work for renders that never commit', async () => {
    const load = vi.fn(() => ({}));
    const resource = defineResource({ load });
    const compute = vi.fn(() => 'unused');
    const cache = defineCache(compute, { resources: { engine: resource } });
    const suspended = new Promise<never>(() => undefined);
    function Uncommitted(): null {
      useResource(resource);
      useCached(cache, {});
      use(suspended);
      return null;
    }
    render(
      <SharedWorkProvider>
        <Suspense fallback="Waiting">
          <Uncommitted />
        </Suspense>
      </SharedWorkProvider>,
    );
    await flush(() => undefined);
    expect(load).not.toHaveBeenCalled();
    expect(compute).not.toHaveBeenCalled();
  });

  it('loads a resource once per deck, including in StrictMode, and disposes it on unmount', async () => {
    const value = { render: (text: string) => text.toUpperCase() };
    const load = vi.fn(() => value);
    const dispose = vi.fn();
    const resource = defineResource({ load, dispose });
    expect(load).not.toHaveBeenCalled();
    function Reader() {
      const result = useResource(resource);
      return <span>{result.value?.render('ready')}</span>;
    }
    const { unmount } = render(
      <StrictMode>
        <SharedWorkProvider>
          <View>
            <Reader />
          </View>
          <View kind="thumbnail">
            <Reader />
          </View>
        </SharedWorkProvider>
      </StrictMode>,
    );
    await waitFor(() => {
      expect(screen.getAllByText('READY')).toHaveLength(2);
    });
    expect(load).toHaveBeenCalledOnce();
    expect(dispose).not.toHaveBeenCalled();
    await flush(() => {
      unmount();
    });
    expect(dispose).toHaveBeenCalledExactlyOnceWith(value);
  });

  it('isolates resources between decks and releases late acquisitions', async () => {
    const acquisition = Promise.withResolvers<object>();
    const load = vi.fn(() => acquisition.promise);
    const dispose = vi.fn();
    const resource = defineResource({ load, dispose });
    function Reader() {
      useResource(resource);
      return null;
    }
    const { unmount } = render(
      <>
        <SharedWorkProvider>
          <Reader />
        </SharedWorkProvider>
        <SharedWorkProvider>
          <Reader />
        </SharedWorkProvider>
      </>,
    );
    await waitFor(() => {
      expect(load).toHaveBeenCalledTimes(2);
    });
    await flush(() => {
      unmount();
    });
    const value = {};
    await flush(() => {
      acquisition.resolve(value);
    });
    expect(dispose).toHaveBeenCalledTimes(2);
    expect(dispose).toHaveBeenCalledWith(value);
  });

  it('shares pending work by arguments across views and keyed arrays', async () => {
    const pending = Promise.withResolvers<string>();
    const compute = vi.fn(
      (args: { text: string; options: { a: number; b: number } }) =>
        args.text === 'x' ? pending.promise : args.text,
    );
    const cache = defineCache(compute);
    function Formula({
      text,
      reverse = false,
    }: {
      text: string;
      reverse?: boolean;
    }) {
      const result = useCached(cache, {
        text,
        options: reverse ? { b: 2, a: 1 } : { a: 1, b: 2 },
      });
      return <span>{result.value}</span>;
    }
    const { rerender } = render(
      <SharedWorkProvider>
        <View>
          {['x', 'y'].map((text) => (
            <Formula key={text} text={text} />
          ))}
        </View>
        <View kind="preview">
          {['y', 'x'].map((text) => (
            <Formula key={text} text={text} reverse />
          ))}
        </View>
      </SharedWorkProvider>,
    );
    await waitFor(() => {
      expect(compute).toHaveBeenCalledTimes(2);
    });
    await flush(() => {
      pending.resolve('x');
    });
    expect(screen.getAllByText('x')).toHaveLength(2);
    rerender(
      <SharedWorkProvider>
        <View>
          {['y', 'x'].map((text) => (
            <Formula key={text} text={text} />
          ))}
        </View>
        <View kind="preview">
          <Formula text="x" />
        </View>
      </SharedWorkProvider>,
    );
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('preloads injected resources in probes without computing or holding transitions', async () => {
    const load = vi.fn(() => ({ prefix: 'loaded ' }));
    const resource = defineResource({ load });
    const compute = vi.fn(
      (args: { text: string }, { engine }: { engine: { prefix: string } }) =>
        engine.prefix + args.text,
    );
    const cache = defineCache(compute, { resources: { engine: resource } });
    const transitions = new SlideTransitions();
    const hold = vi.spyOn(transitions, 'hold');
    function Formula() {
      const result = useCached(cache, { text: 'x' });
      return <span>{result.value}</span>;
    }
    const tree = (kind: SlideViewKind) => (
      <SharedWorkProvider>
        <SlideTransitionsContext value={transitions}>
          <View kind={kind}>
            <Formula />
          </View>
        </SlideTransitionsContext>
      </SharedWorkProvider>
    );
    const { rerender } = render(tree('probe'));
    await waitFor(() => {
      expect(load).toHaveBeenCalledOnce();
    });
    expect(compute).not.toHaveBeenCalled();
    expect(hold).not.toHaveBeenCalled();
    rerender(tree('audience'));
    expect(await screen.findByText('loaded x')).toBeDefined();
    expect(compute).toHaveBeenCalledOnce();
    expect(load).toHaveBeenCalledOnce();
  });

  it('can compute in probes and customize argument keys', async () => {
    const compute = vi.fn((args: { text: string }) => args.text.toLowerCase());
    const cache = defineCache(compute, {
      enabled: 'always',
      key: ({ text }) => text.toLowerCase(),
    });
    function Formula({ text }: { text: string }) {
      const result = useCached(cache, { text });
      return <span>{result.value}</span>;
    }
    render(
      <SharedWorkProvider>
        <View kind="probe">
          <Formula text="HELLO" />
          <Formula text="hello" />
        </View>
      </SharedWorkProvider>,
    );
    await waitFor(() => {
      expect(screen.getAllByText('hello')).toHaveLength(2);
    });
    expect(compute).toHaveBeenCalledOnce();
  });

  it('retains earlier results while their slide has any rendered view', async () => {
    const compute = vi.fn((args: { text: string }) => args.text);
    const cache = defineCache(compute, { maxUnusedEntries: 0 });
    function Formula({ text }: { text: string }) {
      const result = useCached(cache, { text });
      return <span>{result.value}</span>;
    }
    const tree = (text: string, visible: boolean) => (
      <SharedWorkProvider>
        {visible && (
          <View>
            <Formula text={text} />
          </View>
        )}
      </SharedWorkProvider>
    );
    const { rerender } = render(tree('x', true));
    await screen.findByText('x');
    rerender(tree('y', true));
    await screen.findByText('y');
    rerender(tree('x', true));
    await screen.findByText('x');
    expect(compute).toHaveBeenCalledTimes(2);
    await flush(() => {
      rerender(tree('x', false));
    });
    rerender(tree('x', true));
    await screen.findByText('x');
    expect(compute).toHaveBeenCalledTimes(3);
  });

  it('keeps a configurable number of unused results in least-recently-used order', async () => {
    const compute = vi.fn((args: { text: string }) => args.text);
    const cache = defineCache(compute, { maxUnusedEntries: 1 });
    function Formula({ text }: { text: string }) {
      const result = useCached(cache, { text });
      return <span>{result.value}</span>;
    }
    const tree = (text?: string) => (
      <SharedWorkProvider>
        {text !== undefined && (
          <View>
            <Formula text={text} />
          </View>
        )}
      </SharedWorkProvider>
    );
    const { rerender } = render(tree('x'));
    await screen.findByText('x');
    await flush(() => {
      rerender(tree());
    });
    rerender(tree('y'));
    await screen.findByText('y');
    await flush(() => {
      rerender(tree());
    });
    rerender(tree('y'));
    await screen.findByText('y');
    expect(compute).toHaveBeenCalledTimes(2);
    await flush(() => {
      rerender(tree());
    });
    rerender(tree('x'));
    await screen.findByText('x');
    expect(compute).toHaveBeenCalledTimes(3);
  });

  it('shares pending requests after all their original views leave', async () => {
    const pending = Promise.withResolvers<string>();
    const compute = vi.fn(() => pending.promise);
    const cache = defineCache(compute, { maxUnusedEntries: 0 });
    function Reader() {
      const result = useCached(cache, {});
      return <span>{result.value}</span>;
    }
    const tree = (shown: boolean) => (
      <SharedWorkProvider>
        {shown && (
          <View>
            <Reader />
          </View>
        )}
      </SharedWorkProvider>
    );
    const { rerender } = render(tree(true));
    await waitFor(() => {
      expect(compute).toHaveBeenCalledOnce();
    });
    await flush(() => {
      rerender(tree(false));
    });
    rerender(tree(true));
    await flush(() => {
      pending.resolve('ready');
    });
    expect(screen.getByText('ready')).toBeDefined();
    expect(compute).toHaveBeenCalledOnce();
  });

  it('retains results until the last view of an associated slide leaves', async () => {
    const compute = vi.fn(() => 'ready');
    const cache = defineCache(compute, { maxUnusedEntries: 0 });
    function Reader() {
      const result = useCached(cache, {});
      return <span>{result.value}</span>;
    }
    const tree = (reader: boolean, mirror: boolean) => (
      <SharedWorkProvider>
        {reader && (
          <View>
            <Reader />
          </View>
        )}
        {mirror && <View kind="thumbnail" />}
      </SharedWorkProvider>
    );
    const { rerender } = render(tree(true, true));
    await screen.findByText('ready');
    await flush(() => {
      rerender(tree(false, true));
    });
    rerender(tree(true, true));
    await screen.findByText('ready');
    expect(compute).toHaveBeenCalledOnce();
    await flush(() => {
      rerender(tree(false, false));
    });
    rerender(tree(true, false));
    await screen.findByText('ready');
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('distinguishes argument types, array order, and opaque identities', () => {
    const store = new SharedWorkStore();
    const cache = defineCache((args: unknown) => args);
    const args = [
      undefined,
      null,
      0,
      -0,
      NaN,
      Infinity,
      '0',
      false,
      [1, 2],
      [2, 1],
      new Date(0),
      new Date(0),
      Symbol('x'),
      Symbol('x'),
    ];
    expect(
      new Set(args.map((value) => store.cacheKey(cache, value))).size,
    ).toBe(args.length);
    const cyclic: { id: number; self?: unknown } = { id: 1 };
    cyclic.self = cyclic;
    expect(() => store.cacheKey(cache, cyclic)).toThrow('custom key');
    const keyed = defineCache((args: { id: number }) => args.id, {
      key: (args) => args.id,
    });
    expect(store.cacheKey(keyed, cyclic)).toBe(
      store.cacheKey(keyed, { id: 1 }),
    );
  });

  it('reports load and compute failures through hook results', async () => {
    const failure = new Error('failed');
    const resource = defineResource({ load: () => Promise.reject(failure) });
    const compute = vi.fn(
      (args: { text: string }, { engine }: { engine: unknown }) => engine,
    );
    const cache = defineCache(compute, { resources: { engine: resource } });
    const broken = defineCache(() => {
      throw failure;
    });
    function Reader() {
      const a = useResource(resource);
      const b = useCached(cache, { text: 'x' });
      const c = useCached(broken, {});
      return (
        <span>
          {[a, b, c].every(
            (result) => !result.pending && result.error === failure,
          )
            ? 'failed'
            : 'pending'}
        </span>
      );
    }
    render(
      <SharedWorkProvider>
        <View>
          <Reader />
        </View>
      </SharedWorkProvider>,
    );
    await screen.findByText('failed');
    expect(compute).not.toHaveBeenCalled();
  });

  it('supports default, numeric, and disabled holds independently for caches and resources', async () => {
    const loading = Promise.withResolvers<string>();
    const resource = defineResource({
      load: () => loading.promise,
      transitionHold: 300,
    });
    const defaultResource = defineResource({ load: () => loading.promise });
    const cache = defineCache(
      (args: object, { engine }: { engine: string }) => engine,
      {
        resources: { engine: resource },
        transitionHold: 1000,
      },
    );
    const silent = defineCache(() => loading.promise, {
      transitionHold: false,
    });
    const transitions = new SlideTransitions();
    const release = vi.fn();
    const hold = vi.spyOn(transitions, 'hold').mockReturnValue(release);
    function Reader() {
      useResource(defaultResource);
      useCached(cache, {});
      useCached(silent, {});
      return null;
    }
    const { unmount } = render(
      <SharedWorkProvider>
        <SlideTransitionsContext value={transitions}>
          <View>
            <Reader />
          </View>
        </SlideTransitionsContext>
      </SharedWorkProvider>,
    );
    expect(hold).toHaveBeenCalledWith(undefined);
    expect(hold).toHaveBeenCalledWith(300);
    expect(hold).toHaveBeenCalledWith(1000);
    expect(hold).toHaveBeenCalledTimes(3);
    await flush(() => {
      loading.resolve('ready');
    });
    expect(release).toHaveBeenCalledTimes(3);
    await flush(() => {
      unmount();
    });
  });

  it('waits for running derivations before disposing their resources', async () => {
    const working = Promise.withResolvers<string>();
    const dispose = vi.fn();
    const resource = defineResource({ load: () => ({}), dispose });
    const compute = vi.fn(() => working.promise);
    const cache = defineCache(compute, { resources: { engine: resource } });
    function Reader() {
      useCached(cache, {});
      return null;
    }
    const { unmount } = render(
      <SharedWorkProvider>
        <View>
          <Reader />
        </View>
      </SharedWorkProvider>,
    );
    await waitFor(() => {
      expect(compute).toHaveBeenCalledOnce();
    });
    await flush(() => {
      unmount();
    });
    expect(dispose).not.toHaveBeenCalled();
    await flush(() => {
      working.resolve('ready');
    });
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('skips derivations if the Deck leaves while dependencies are loading', async () => {
    const pending = Promise.withResolvers<object>();
    const dispose = vi.fn();
    const resource = defineResource({ load: () => pending.promise, dispose });
    const compute = vi.fn(() => 'unused');
    const cache = defineCache(compute, { resources: { engine: resource } });
    function Reader() {
      useCached(cache, {});
      return null;
    }
    const { unmount } = render(
      <SharedWorkProvider>
        <View>
          <Reader />
        </View>
      </SharedWorkProvider>,
    );
    await flush(() => {
      unmount();
    });
    await flush(() => {
      pending.resolve({});
    });
    expect(compute).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('cleans up other resources when a disposer fails', async () => {
    const dispose = vi.fn();
    const broken = defineResource({
      load: () => ({}),
      dispose: () => {
        throw new Error('cleanup failed');
      },
    });
    const healthy = defineResource({ load: () => ({}), dispose });
    const store = new SharedWorkStore();
    await Promise.all([
      store.loadResource(broken),
      store.loadResource(healthy),
    ]);
    await expect(store.dispose()).rejects.toThrow(
      'Cannot dispose deck resources',
    );
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('preloads through actual slide probes without registering persistent slide state', async () => {
    // Exercise the probes before background thumbnail views start deriving values.
    vi.spyOn(thumbnailIdle, 'whenIdle').mockImplementation(
      () => () => undefined,
    );
    const load = vi.fn(() => ({}));
    const resource = defineResource({ load });
    const compute = vi.fn(() => 'ready');
    const cache = defineCache(compute, { resources: { engine: resource } });
    function Formula() {
      useCached(cache, {});
      return null;
    }
    function State() {
      const { hasState, stateChanged } = useDeck();
      return <span>{JSON.stringify([hasState, stateChanged])}</span>;
    }
    render(
      <Deck>
        <Slide title="First">
          <State />
        </Slide>
        <Slide title="Second">
          <Formula />
        </Slide>
      </Deck>,
    );
    await waitFor(() => {
      expect(load).toHaveBeenCalledOnce();
    });
    expect(compute).not.toHaveBeenCalled();
    expect(screen.getByText('[[false,false],[false,false]]')).toBeDefined();
  });
});
