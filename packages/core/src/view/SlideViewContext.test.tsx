import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  PointerMirroringContext,
  SlideViewContext,
  useSlideView,
} from './SlideViewContext.ts';

afterEach(cleanup);

describe('useSlideView pointer mirroring', () => {
  it('defaults to no mirroring outside a deck', () => {
    const { result } = renderHook(useSlideView);
    expect(result.current.mirrorPointer).toBe(false);
    expect(result.current.interactive).toBe(true);
  });

  it.each([
    ['audience', true],
    ['presenter', true],
    ['thumbnail', false],
    ['preview', false],
    ['probe', false],
  ] as const)('reports mirroring in the %s view as %s', (kind, expected) => {
    const { result } = renderHook(useSlideView, {
      wrapper: ({ children }) => (
        <PointerMirroringContext value={true}>
          <SlideViewContext value={{ index: 0, kind, interactive: false }}>
            {children}
          </SlideViewContext>
        </PointerMirroringContext>
      ),
    });
    expect(result.current.mirrorPointer).toBe(expected);
    expect(result.current.interactive).toBe(false);
  });
});
