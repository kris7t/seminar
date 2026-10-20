import {
  defineCache,
  defineResource,
  type CacheDefinition,
  type ResourceDefinition,
} from '@slider/core';

import type { RenderedFormula, RenderOptions } from './render.ts';
import type { RuntimeDynamicMath } from './runtimeOptions.ts';

interface FormulaInput extends Omit<RenderOptions, 'font' | 'onError'> {
  tex: string;
}

interface CachedFormula extends RenderedFormula {
  errors: readonly string[];
}

type Renderer = Awaited<ReturnType<RuntimeDynamicMath['loadRenderer']>>;
type FormulaCache = CacheDefinition<
  FormulaInput,
  CachedFormula,
  { renderer: ResourceDefinition<Renderer> }
>;

// Views share runtime options, but each Deck owns the instances and results.
const caches = new WeakMap<RuntimeDynamicMath, FormulaCache>();

/** Returns stable definitions for the immutable math options of a deck. */
export function formulaCache(dynamic: RuntimeDynamicMath): FormulaCache {
  let cache = caches.get(dynamic);
  if (cache === undefined) {
    const renderer = defineResource({
      load: () => dynamic.loadRenderer(),
      transitionHold: 1000,
    });
    cache = defineCache(
      async ({ tex, ...options }: FormulaInput, { renderer }) => {
        const errors: string[] = [];
        const formula = await renderer.renderFormula(tex, {
          ...options,
          font: dynamic.font,
          onError: (message) => {
            errors.push(message);
          },
        });
        return { ...formula, errors };
      },
      { resources: { renderer }, transitionHold: 1000 },
    );
    caches.set(dynamic, cache);
  }
  return cache;
}
