/** Whether a pending consumer holds a transition, or its deadline in ms. */
export type TransitionHold = boolean | number;

/** The current result of loading a resource or computing a cached value. */
export type LoadResult<T> =
  | { status: 'pending'; pending: true; value: undefined; error: undefined }
  | { status: 'success'; pending: false; value: T; error: undefined }
  | { status: 'error'; pending: false; value: undefined; error: unknown };

/** Options of a lazily loaded, deck-owned resource. */
export interface ResourceOptions<T> {
  /** Acquires the resource when a committed consumer first requests it. */
  load(): T | PromiseLike<T>;
  /** Releases the resource when the Deck unmounts, after its work finishes. */
  dispose?(value: NoInfer<T>): void | PromiseLike<void>;
  /** Holds visible consumers while loading. Defaults to `true`. */
  transitionHold?: TransitionHold | undefined;
}

/** An inert resource definition. Each Deck acquires its own instance. */
export interface ResourceDefinition<T> extends ResourceOptions<T> {
  readonly kind: 'resource';
}

/** Defines a resource without acquiring it or registering global state. */
/* @__NO_SIDE_EFFECTS__ */
export function defineResource<T>(
  options: ResourceOptions<T>,
): ResourceDefinition<T> {
  return { ...options, kind: 'resource' };
}

/** Named resources injected into a cache's derivation. */
export type ResourceDependencies = Readonly<
  Record<string, ResourceDefinition<unknown>>
>;

/** Resolved values of the resources declared by a cache. */
export type ResourceValues<Resources extends ResourceDependencies> = {
  [Name in keyof Resources]: Resources[Name] extends ResourceDefinition<infer T>
    ? T
    : never;
};

/** Options of a shared, argument-keyed computation. */
export interface CacheOptions<
  Args,
  Resources extends ResourceDependencies = ResourceDependencies,
> {
  /** Loaded even in probes, independently of `enabled`. */
  resources?: Resources | undefined;
  /**
   * Derives the value used to identify equal requests. Defaults to the
   * arguments. Plain objects and arrays are compared structurally; other
   * objects and functions are compared by identity. Cyclic data needs a key.
   */
  key?(args: Args): unknown;
  /** Whether probes also compute values. Defaults to `'visible'`. */
  enabled?: 'visible' | 'always' | undefined;
  /** Holds visible consumers while computing. Defaults to `true`. */
  transitionHold?: TransitionHold | undefined;
  /**
   * Maximum retained entries unused by rendered slides, in least-recently-used
   * order. Defaults to 8; `0` evicts promptly, and `Infinity` retains all.
   */
  maxUnusedEntries?: number | undefined;
}

/** An inert cache definition. Entries and resources belong to each Deck. */
export interface CacheDefinition<
  Args,
  T,
  Resources extends ResourceDependencies = ResourceDependencies,
> extends CacheOptions<Args, Resources> {
  readonly kind: 'cache';
  /** Computes a value from request arguments and resolved resources. */
  compute(args: Args, resources: ResourceValues<Resources>): T | PromiseLike<T>;
}

/** Defines shared work without running it or acquiring its dependencies. */
/* @__NO_SIDE_EFFECTS__ */
export function defineCache<
  Args,
  T,
  Resources extends ResourceDependencies = ResourceDependencies,
>(
  compute: (
    args: Args,
    resources: ResourceValues<Resources>,
  ) => T | PromiseLike<T>,
  options: CacheOptions<Args, Resources> = {},
): CacheDefinition<Args, T, Resources> {
  return { ...options, kind: 'cache', compute };
}
