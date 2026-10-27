import { compareStepPaths } from '../steps/stepRange.ts';
import type { StepPath, StepStore } from '../steps/StepStore.ts';

/** A page of a slide to print. */
export interface PlannedPage {
  /** Identifies the page among the pages of all slides. */
  key: string;
  /** Index of the slide. */
  index: number;
  /** The step the page shows. */
  path: StepPath;
}

/**
 * Plans the pages of slides from their stores, which show the last step of
 * each slide, and tell which other steps to make pages of before it. The
 * slides should be rendered with these stores apart from the pages, so that
 * laying out the pages doesn't change them.
 */
export class PagePlan {
  readonly #stores: ReadonlyMap<number, StepStore>;
  readonly #every: boolean;
  #inputs: (readonly unknown[])[] = [];
  #pages: readonly PlannedPage[] = [];

  /**
   * @param stores The stores of the slides to print, by their index.
   * @param every Whether to make a page of every step, rather than of the
   *   steps that the slides are split at.
   */
  constructor(stores: ReadonlyMap<number, StepStore>, every: boolean) {
    this.#stores = stores;
    this.#every = every;
  }

  subscribe = (listener: () => void): (() => void) => {
    const unsubscribes = [...this.#stores.values()].map((store) =>
      store.subscribe(listener),
    );
    return () => {
      for (const unsubscribe of unsubscribes) {
        unsubscribe();
      }
    };
  };

  /** Returns the pages, which are stable while the stores don't change. */
  getPages = (): readonly PlannedPage[] => {
    const inputs = [...this.#stores.values()].map((store) => [
      this.#every ? store.getStates() : store.getSplitPaths(),
      store.getPath(),
    ]);
    if (
      inputs.length !== this.#inputs.length ||
      inputs.some((input, i) =>
        input.some((value, j) => value !== this.#inputs[i]?.[j]),
      )
    ) {
      this.#inputs = inputs;
      this.#pages = [...this.#stores].flatMap(([index, store]) => {
        const last = store.getPath();
        const paths = this.#every ? store.getStates() : store.getSplitPaths();
        return [
          ...paths.filter((path) => compareStepPaths(path, last) < 0),
          last,
        ].map((path) => ({
          key: `${String(index)}:${path.join('.')}`,
          index,
          path,
        }));
      });
    }
    return this.#pages;
  };
}
