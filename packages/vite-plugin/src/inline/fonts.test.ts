import { describe, expect, it } from 'vitest';

import { collectCodePoints, parseUnicodeRange, pruneFonts } from './fonts.ts';

const CSS = `@font-face {
  font-family: 'Roboto';
  src: url(latin.woff2) format('woff2'), url(latin.woff) format('woff');
  unicode-range: U+0000-00FF, U+2000-206F;
}
@font-face {
  font-family: 'Roboto';
  src: url("data:font/woff2;base64,AA==") format("woff2"),
    url("data:font/woff;base64,AA==") format("woff");
  unicode-range: U+0400-045F;
}
@font-face {
  font-family: 'Other';
  src: url(other.woff) format('woff');
}
`;

describe('parseUnicodeRange', () => {
  it('parses ranges, single code points, and wildcards', () => {
    expect(parseUnicodeRange('U+0000-00FF, U+131,u+4??')).toEqual([
      [0, 0xff],
      [0x131, 0x131],
      [0x400, 0x4ff],
    ]);
  });

  it('rejects invalid ranges', () => {
    expect(parseUnicodeRange('U+00G0')).toBeUndefined();
  });
});

describe('collectCodePoints', () => {
  it('collects literal characters and HTML character references', () => {
    const codePoints = collectCodePoints(
      ['a\nő', '&#x416;&#1047;', '\\u0400'],
      {
        html: true,
      },
    );
    expect(codePoints).toContain(0x61);
    expect(codePoints).toContain(0x151);
    expect(codePoints).toContain(0x416);
    expect(codePoints).toContain(1047);
    // Control characters and JavaScript escapes are left out.
    expect(codePoints).not.toContain(0x0a);
    expect(codePoints).not.toContain(0x400);
    // Character references only count in HTML.
    expect(collectCodePoints(['&#x416;'])).not.toContain(0x416);
  });
});

describe('pruneFonts', () => {
  it('removes WOFF fallbacks and fonts for unused characters', () => {
    const css = pruneFonts(CSS, { used: new Set([0x41]) });
    expect(css).toContain("url(latin.woff2) format('woff2');");
    expect(css).not.toContain('latin.woff)');
    expect(css).not.toContain('U+0400-045F');
    // Fonts without WOFF2 or a unicode-range are kept.
    expect(css).toContain("url(other.woff) format('woff')");
  });

  it('keeps fonts for used characters and kept ranges', () => {
    expect(pruneFonts(CSS, { used: new Set([0x416]) })).toContain(
      'U+0400-045F',
    );
    expect(
      pruneFonts(CSS, { used: new Set(), keep: [[0x400, 0x400]] }),
    ).toMatch(/format\("woff2"\);\s*unicode-range: U\+0400-045F/);
  });
});
