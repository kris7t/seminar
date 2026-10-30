import { createContext, type Context } from 'react';

function isPlainObject(value: object): boolean {
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isReference(value: unknown): value is object {
  return (
    typeof value === 'function' || (typeof value === 'object' && value !== null)
  );
}

/** Stands for an initial value that hasn't been computed. */
export const LAZY_INITIAL: unique symbol = Symbol('lazy initial value');

/**
 * Whether two values are certainly different: primitives, arrays, and plain
 * objects are compared by their contents, but other objects and functions may
 * be different objects for the same thing.
 */
function differs(
  a: unknown,
  b: unknown,
  ancestors = new Set<object>(),
): boolean {
  if (Object.is(a, b) || a === LAZY_INITIAL || b === LAZY_INITIAL) return false;
  if (!isReference(a) || !isReference(b)) return true;
  const isPlain = (value: object) =>
    Array.isArray(value) || isPlainObject(value);
  if (!isPlain(a) || !isPlain(b) || ancestors.has(a)) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return true;
  ancestors.add(a);
  const result = [...new Set([...Object.keys(a), ...Object.keys(b)])].some(
    (key) =>
      differs(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
        ancestors,
      ),
  );
  ancestors.delete(a);
  return result;
}

/** Finds the components in a view of a slide that use the same state by mistake. */
export class StateClaims {
  readonly #claims = new Map<
    string,
    Map<string, { initial: unknown; transient: boolean }>
  >();
  readonly #namespaces = new Set<string>();
  readonly #warned = new Set<string>();
  /** Whether a clash of namespaces was reported, which explains other clashes. */
  #namespacesClashed = false;

  /**
   * Records that the mounted instance identified by `instance` uses the state
   * `id`, until the returned function is called. Throws if another instance
   * uses it as transient and the other as non-transient state, or with
   * another initial value, since only one of them is used. Warns if another
   * instance uses it otherwise, since they share the state.
   */
  claim(
    id: string,
    instance: string,
    initial: unknown,
    transient: boolean,
  ): () => void {
    if (this.#namespacesClashed) return () => undefined;
    let claims = this.#claims.get(id);
    if (claims === undefined) {
      claims = new Map();
      this.#claims.set(id, claims);
    }
    const others = [...claims.values()];
    if (others.some((other) => other.transient !== transient)) {
      throw new Error(
        `Several components on the same slide use the state "${id}" as both transient and non-transient state. Give them different ids.`,
      );
    }
    if (others.some((other) => differs(other.initial, initial))) {
      throw new Error(
        `Several components on the same slide use the state "${id}" with different initial values. Give them different ids or namespaces, or use a store.`,
      );
    }
    if (others.length > 0 && !this.#warned.has(id)) {
      this.#warned.add(id);
      console.warn(
        `Several components on the same slide use the state "${id}", so they share it. Give them different ids or namespaces if they shouldn't, or use a store if they should.`,
      );
    }
    claims.set(instance, { initial, transient });
    return () => {
      claims.delete(instance);
    };
  }

  /**
   * Records that a namespace with the path `path` is mounted, until the
   * returned function is called. Throws if another one has the same path,
   * since the states inside them would be the same.
   */
  claimNamespace(path: string): () => void {
    if (this.#namespaces.has(path)) {
      this.#namespacesClashed = true;
      throw new Error(
        `Several state namespaces on the same slide have the path "${path}". Give them different ids.`,
      );
    }
    this.#namespaces.add(path);
    return () => {
      this.#namespaces.delete(path);
    };
  }
}

/**
 * Identifies the state of the components in a view of a slide (or a part of
 * it, see {@link SlideStateNamespace}) without explicit ids: each instance
 * gets the next index when it first renders in the scope.
 */
export class StateScope {
  readonly path: string;
  /** Shared by the scopes of a view, since namespaces can have the same id. */
  readonly claims: StateClaims;
  readonly #indices = new Map<string, number>();
  /** Whether the components that render with the scope have mounted. */
  #committed = false;

  constructor(path = '', claims: StateClaims = new StateClaims()) {
    this.path = path;
    this.claims = claims;
  }

  /** Returns a new scope for the namespace `id` in this scope. */
  child(id: string): StateScope {
    return new StateScope(`${this.path}/${id}`, this.claims);
  }

  /** Marks the components that rendered with the scope as mounted. */
  commit(): void {
    this.#committed = true;
  }

  /**
   * Returns the index of the component instance identified by `instance`
   * (from `useId`), allocating the next one when it is first seen.
   */
  indexOf(instance: string): number {
    let index = this.#indices.get(instance);
    if (index === undefined) {
      index = this.#indices.size;
      this.#indices.set(instance, index);
      if (this.#committed) {
        console.warn(
          'useSlideState was called without an id in a component that mounted after its slide. Its state may differ between the views of the slide, so pass it an id.',
        );
      }
    }
    return index;
  }
}

export const StateScopeContext: Context<StateScope | undefined> = createContext<
  StateScope | undefined
>(undefined);
