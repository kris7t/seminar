import { waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SharedWorkStore } from '../../../core/src/shared/SharedWorkStore.ts';
import { defineMathFont } from './fonts.ts';
import { formulaCache } from './formulaCache.ts';
import type { RenderedFormula } from './render.ts';

function setup() {
  const typeset = vi.fn((tex: string) =>
    Promise.resolve({
      svg: `<svg>${tex}</svg>`,
      mathml: `<math>${tex}</math>`,
      fullWidth: false,
      minWidth: undefined,
    } satisfies RenderedFormula),
  );
  const cache = formulaCache({
    font: defineMathFont(() => Promise.resolve({}), {}),
    loadRenderer: () => Promise.resolve({ renderFormula: typeset }),
  });
  const store = new SharedWorkStore();
  const input = (tex: string) => ({
    tex,
    display: false,
    macros: {},
    tags: 'none' as const,
  });
  const show = async (slide: number, formulas: string[]) => {
    const leave = store.mountSlide(slide);
    for (const tex of formulas) {
      const args = input(tex);
      store.request(cache, store.cacheKey(cache, args), args, slide, true);
    }
    await waitFor(() => {
      for (const tex of formulas)
        expect(
          store.readCached(cache, store.cacheKey(cache, input(tex))).status,
        ).toBe('success');
    });
    leave();
    await Promise.resolve();
  };
  return { typeset, show, store };
}

describe('formulaCache retention', () => {
  it('reuses equations beyond the complete working sets of recent slides', async () => {
    const { typeset, show, store } = setup();
    const formulas = (slide: number) =>
      Array.from(
        { length: 10 },
        (_, index) => `${String(slide)}:${String(index)}`,
      );
    for (let slide = 0; slide < 6; slide += 1)
      await show(slide, formulas(slide));
    expect(typeset).toHaveBeenCalledTimes(60);
    await show(0, formulas(0));
    expect(typeset).toHaveBeenCalledTimes(60);
    await store.dispose();
  });
});
