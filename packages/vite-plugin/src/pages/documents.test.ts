import { describe, expect, it } from 'vitest';

import { breakLines, cleanDocument, wrapLines } from './documents.ts';

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

describe('breakLines', () => {
  it('starts blocks on lines of their own', () => {
    expect(
      breakLines(
        '<h4 id="a">A <a href="#a">#</a></h4><p>Text <em>here</em></p><ul><li>One</li><li>Two</li></ul>',
      ),
    ).toBe(
      '<h4 id="a">A <a href="#a">#</a></h4>\n<p>Text <em>here</em></p>\n<ul>\n<li>One</li>\n<li>Two</li></ul>',
    );
  });

  it('keeps preformatted text as it is', () => {
    expect(
      breakLines(
        '<p>Code</p><pre data-lang="html">&lt;p&gt;<b>x</b><div></div></pre><p>After</p>',
      ),
    ).toBe(
      '<p>Code</p>\n<pre data-lang="html">&lt;p&gt;<b>x</b><div></div></pre>\n<p>After</p>',
    );
  });
});

describe('wrapLines', () => {
  it('breaks long lines at spaces in text and between attributes', () => {
    const html = '<p id="a" title="x y z">one two three four</p>';
    const wrapped = wrapLines(html, 12);
    expect(wrapped.length).toBe(html.length);
    expect(wrapped).toBe('<p id="a"\ntitle="x y z">one\ntwo three\nfour</p>');
  });

  it('keeps text that has to stay as it is', () => {
    const html =
      '<pre>a b c d e f g</pre> <math><annotation encoding="x">a b > c d</annotation></math> <svg><title>a b c d</title></svg>';
    expect(wrapLines(html, 4)).toBe(
      '<pre>a b c d e f g</pre>\n<math><annotation\nencoding="x">a b > c d</annotation></math>\n<svg><title>a b c d</title></svg>',
    );
  });
});
