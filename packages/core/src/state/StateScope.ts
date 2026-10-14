import { createContext, type Context } from 'react';

/**
 * Identifies the state of the components in a view of a slide (or a part of
 * it, see {@link SlideStateScope}) without explicit keys: each instance gets
 * the next index when it first renders in the scope.
 */
export class StateScope {
  readonly path: string;
  readonly #indices = new Map<string, number>();
  /** Whether the components that render with the scope have mounted. */
  #committed = false;

  constructor(path: string) {
    this.path = path;
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
          'useSlideState was called without a key in a component that mounted after its slide. Its state may differ between the views of the slide, so pass it a key.',
        );
      }
    }
    return index;
  }
}

export const StateScopeContext: Context<StateScope | undefined> = createContext<
  StateScope | undefined
>(undefined);
