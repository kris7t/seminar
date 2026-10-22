import { describe, expect, it } from 'vitest';

import { cleanDocument } from './documents.ts';

describe('cleanDocument', () => {
  it('removes classes and the markers of hydration', () => {
    expect(
      cleanDocument(
        '<!--$--><p class="css-1 MuiBox-root">A<!-- --> b</p><!--/$-->' +
          '<math data-mjx-texclass="ORD"></math><p>class=&quot;x&quot;</p>',
      ),
    ).toBe(
      '<p>A b</p><math data-mjx-texclass="ORD"></math><p>class=&quot;x&quot;</p>',
    );
  });

  it('keeps other comments', () => {
    expect(cleanDocument('<div><!--note--></div>')).toBe(
      '<div><!--note--></div>',
    );
  });
});
