import type {
  CacheDefinition,
  LoadResult,
  ResourceDefinition,
  ResourceDependencies,
  ResourceValues,
} from './definitions.ts';

const PENDING: LoadResult<never> = {
  status: 'pending',
  pending: true,
  value: undefined,
  error: undefined,
};

interface Entry {
  result: LoadResult<unknown>;
  promise: Promise<LoadResult<unknown>> | undefined;
  listeners: Set<() => void>;
}

interface ResourceEntry extends Entry {
  users: Set<Promise<LoadResult<unknown>>>;
}

interface CacheEntry extends Entry {
  slides: Set<number>;
  usedAt: number;
}

interface CacheState {
  entries: Map<string, CacheEntry>;
  maxUnusedEntries: number;
}

function entry(): Entry {
  return { result: PENDING, promise: undefined, listeners: new Set() };
}

function subscribe(entry: Entry, listener: () => void): () => void {
  entry.listeners.add(listener);
  return () => {
    entry.listeners.delete(listener);
  };
}

/** Deck-owned resource instances, cache entries, and rendered-slide leases. */
export class SharedWorkStore {
  readonly #resources = new Map<ResourceDefinition<unknown>, ResourceEntry>();
  readonly #caches = new Map<object, CacheState>();
  readonly #slides = new Map<number, number>();
  readonly #identities = new WeakMap<object, number>();
  readonly #symbols = new Map<symbol, number>();
  #nextIdentity = 0;
  #clock = 0;
  #owners = 0;
  #disposed = false;
  #pruning = false;

  /** Defers disposal across StrictMode's effect teardown and setup. */
  mount(): () => void {
    this.#owners += 1;
    return () => {
      this.#owners -= 1;
      queueMicrotask(() => {
        if (this.#owners === 0) {
          void this.dispose().catch((error: unknown) => {
            console.error('Cannot dispose deck resources', error);
          });
        }
      });
    };
  }

  mountSlide(index: number): () => void {
    this.#slides.set(index, (this.#slides.get(index) ?? 0) + 1);
    return () => {
      const remaining = (this.#slides.get(index) ?? 1) - 1;
      if (remaining === 0) this.#slides.delete(index);
      else this.#slides.set(index, remaining);
      this.#pruneLater();
    };
  }

  readResource<T>(definition: ResourceDefinition<T>): LoadResult<T> {
    return (this.#resources.get(definition)?.result ??
      PENDING) as LoadResult<T>;
  }

  #resource(definition: ResourceDefinition<unknown>): ResourceEntry {
    let state = this.#resources.get(definition);
    if (state === undefined) {
      state = { ...entry(), users: new Set() };
      this.#resources.set(definition, state);
    }
    return state;
  }

  subscribeResource(
    definition: ResourceDefinition<unknown>,
    listener: () => void,
  ): () => void {
    return subscribe(this.#resource(definition), listener);
  }

  loadResource(
    definition: ResourceDefinition<unknown>,
  ): Promise<LoadResult<unknown>> {
    if (this.#disposed) return Promise.resolve(PENDING);
    const state = this.#resource(definition);
    state.promise ??= this.#run(state, () => definition.load());
    return state.promise;
  }

  preload(resources: ResourceDependencies): void {
    for (const definition of Object.values(resources)) {
      void this.loadResource(definition);
    }
  }

  #cache(definition: { maxUnusedEntries?: number | undefined }): CacheState {
    let state = this.#caches.get(definition);
    if (state === undefined) {
      const limit = definition.maxUnusedEntries ?? 8;
      state = {
        entries: new Map(),
        maxUnusedEntries: Number.isNaN(limit)
          ? 8
          : Math.max(0, Math.floor(limit)),
      };
      this.#caches.set(definition, state);
    }
    return state;
  }

  #cacheEntry(
    definition: { maxUnusedEntries?: number | undefined },
    key: string,
  ): CacheEntry {
    const cache = this.#cache(definition);
    let state = cache.entries.get(key);
    if (state === undefined) {
      state = { ...entry(), slides: new Set(), usedAt: 0 };
      cache.entries.set(key, state);
    }
    return state;
  }

  readCached<T>(definition: object, key: string): LoadResult<T> {
    return (this.#caches.get(definition)?.entries.get(key)?.result ??
      PENDING) as LoadResult<T>;
  }

  subscribeCached(
    definition: { maxUnusedEntries?: number | undefined },
    key: string,
    listener: () => void,
  ): () => void {
    const unsubscribe = subscribe(this.#cacheEntry(definition, key), listener);
    return () => {
      unsubscribe();
      this.#pruneLater();
    };
  }

  request<Args, T, Resources extends ResourceDependencies>(
    definition: CacheDefinition<Args, T, Resources>,
    key: string,
    args: Args,
    slide: number,
    visible: boolean,
  ): void {
    if (this.#disposed) return;
    const resources: ResourceDependencies = definition.resources ?? {};
    this.preload(resources);
    if (!visible && definition.enabled !== 'always') return;
    const state = this.#cacheEntry(definition, key);
    if (visible) state.slides.add(slide);
    state.usedAt = ++this.#clock;
    if (state.promise !== undefined) return;
    const dependencies = Object.entries(resources);
    const loading = dependencies.map(([, resource]) =>
      this.loadResource(resource),
    );
    const computation = this.#run(state, async () => {
      const results = await Promise.all(loading);
      if (this.#disposed) throw new Error('The Deck was unmounted');
      const values: Record<string, unknown> = Object.fromEntries(
        dependencies.map(([name], index) => {
          const result = results[index];
          if (result?.status !== 'success') throw result?.error;
          return [name, result.value];
        }),
      );
      return definition.compute(args, values as ResourceValues<Resources>);
    });
    state.promise = computation;
    for (const [, resource] of dependencies) {
      const users = this.#resource(resource).users;
      users.add(computation);
      void computation.then(() => {
        users.delete(computation);
      });
    }
  }

  async #run(
    state: Entry,
    compute: () => unknown,
  ): Promise<LoadResult<unknown>> {
    try {
      const value: unknown = await Promise.resolve().then(compute);
      state.result = {
        status: 'success',
        pending: false,
        value,
        error: undefined,
      };
    } catch (error) {
      state.result = {
        status: 'error',
        pending: false,
        value: undefined,
        error,
      };
    }
    if (!this.#disposed) {
      for (const listener of state.listeners) listener();
      this.#pruneLater();
    }
    return state.result;
  }

  #pruneLater(): void {
    if (this.#pruning || this.#disposed) return;
    this.#pruning = true;
    queueMicrotask(() => {
      this.#pruning = false;
      for (const cache of this.#caches.values()) {
        const unused = [...cache.entries]
          .filter(
            ([, state]) =>
              state.listeners.size === 0 &&
              !(state.promise !== undefined && state.result.pending) &&
              ![...state.slides].some((slide) => this.#slides.has(slide)),
          )
          .sort((a, b) => b[1].usedAt - a[1].usedAt);
        for (const [key] of unused.slice(cache.maxUnusedEntries))
          cache.entries.delete(key);
      }
    });
  }

  cacheKey<Args>(
    definition: { key?(args: Args): unknown },
    args: Args,
  ): string {
    return this.#key(
      definition.key === undefined ? args : definition.key(args),
      new Set(),
    );
  }

  #identity(value: object): number {
    let identity = this.#identities.get(value);
    if (identity === undefined) {
      identity = ++this.#nextIdentity;
      this.#identities.set(value, identity);
    }
    return identity;
  }

  #key(value: unknown, ancestors: Set<object>): string {
    if (value === null) return 'null';
    switch (typeof value) {
      case 'undefined':
        return 'undefined';
      case 'boolean':
        return value ? 'true' : 'false';
      case 'string':
        return JSON.stringify(value);
      case 'number':
        return `number:${Object.is(value, -0) ? '-0' : String(value)}`;
      case 'bigint':
        return `bigint:${String(value)}`;
      case 'symbol': {
        let identity = this.#symbols.get(value);
        if (identity === undefined) {
          identity = ++this.#nextIdentity;
          this.#symbols.set(value, identity);
        }
        return `symbol:${String(identity)}`;
      }
      case 'function':
        return `identity:${String(this.#identity(value))}`;
      case 'object': {
        const array = Array.isArray(value);
        const prototype: unknown = Object.getPrototypeOf(value);
        if (!array && prototype !== Object.prototype && prototype !== null)
          return `identity:${String(this.#identity(value))}`;
        if (ancestors.has(value))
          throw new TypeError('Cyclic cache arguments need a custom key');
        ancestors.add(value);
        const result = array
          ? `array:${String(value.length)}[${value.map((item: unknown) => this.#key(item, ancestors)).join(',')}]`
          : `{${Object.keys(value)
              .sort()
              .map(
                (key) =>
                  `${JSON.stringify(key)}:${this.#key((value as Record<string, unknown>)[key], ancestors)}`,
              )
              .join(',')}}`;
        ancestors.delete(value);
        return result;
      }
    }
    throw new TypeError('Unsupported cache key');
  }

  /** Releases resources after all computations borrowing them have settled. */
  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    const disposing = [...this.#resources].map(async ([definition, state]) => {
      const result = await state.promise;
      await Promise.all(state.users);
      if (result?.status === 'success')
        await definition.dispose?.(result.value);
    });
    this.#resources.clear();
    this.#caches.clear();
    this.#slides.clear();
    this.#symbols.clear();
    const results = await Promise.allSettled(disposing);
    const errors = results.flatMap((result) =>
      result.status === 'rejected' ? [result.reason as unknown] : [],
    );
    if (errors.length > 0)
      throw new AggregateError(errors, 'Cannot dispose deck resources');
  }
}
