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

  it('removes styles and the links that preload images', () => {
    expect(
      cleanDocument(
        '<link rel="preload" as="image" href="data:image/png;base64,AA"/>' +
          '<p>A</p><style data-emotion="css 1x">.css-1x{color:red}</style><img src="x"/>',
      ),
    ).toBe('<p>A</p><img src="x"/>');
  });

  it('keeps other comments', () => {
    expect(cleanDocument('<div><!--note--></div>')).toBe(
      '<div><!--note--></div>',
    );
  });
});
