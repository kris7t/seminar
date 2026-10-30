import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SlideMirror } from './SlideMirror.tsx';

describe('SlideMirror', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('requires a deck, which has the step of the slide', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() =>
      render(<SlideMirror index={0} slide={null} kind="audience" />),
    ).toThrow('Mirrors of slides require a Deck');
  });
});
