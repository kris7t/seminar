import { describe, expect, it } from 'vitest';

import { colophonStart, CONTENT_END, writeColophon } from './colophon.ts';

/** Returns the lines of the colophon of `html`. */
function lines(html: string): string[] {
  return (
    /<p id="seminar-colophon" lang="en">(.*?)<\/p>/.exec(html)?.[1] ?? ''
  ).split('<br>');
}

describe('writeColophon', () => {
  it('describes the document and what follows it', () => {
    const html =
      `<body><div id="seminar-content">${colophonStart({ kind: 'document', notes: true })}` +
      // A `main` in the content doesn't end it.
      `<main><h1>Talk</h1><main></main></div>${'x'.repeat(5000)}</main>${CONTENT_END}</div>` +
      `<div id="seminar-root"></div><script type="module">${'y'.repeat(2_500_000)}</script></body>`;
    const written = writeColophon(html, {
      images: ['PNG', 'JPEG'],
      fonts: true,
      scripts: true,
    });
    expect(lines(written)).toEqual([
      'Slide content: <code>&lt;main&gt;</code>, about the first 6 KB. Speaker notes in <code>&lt;aside&gt;</code>.',
      'Images: <code>&lt;use href="#seminar-image-N"&gt;</code> refers to <code>&lt;image id="seminar-image-N"&gt;</code> in <code>&lt;svg id="seminar-images"&gt;</code> (base64 PNG/JPEG) after the slides.',
      // Rounded up, so that reading as much doesn't stop short.
      'Followed by images, fonts, and scripts (about 2.6 MB).',
    ]);
    expect(written).not.toContain('<!--');
    // The content, with the colophon, is no larger than it says.
    const contentEnd = written.indexOf('</div><div id="seminar-root">');
    expect(Buffer.byteLength(written.slice(0, contentEnd))).toBeLessThanOrEqual(
      6000,
    );
  });

  it('only describes what the page has', () => {
    const html =
      `<div id="seminar-content">${colophonStart({ kind: 'source' })}<main><pre>---</pre></main>${CONTENT_END}</div>` +
      '<script type="module" src="./talk.js"></script>';
    expect(lines(writeColophon(html))).toEqual([
      'The MDX source of the deck: <code>&lt;main&gt;</code>, about the first 1 KB.',
    ]);
  });

  it('leaves pages without the markers of their content as they are', () => {
    const html = `${colophonStart({ kind: 'source' })}<main></main>`;
    expect(writeColophon(html)).toBe(html);
  });
});
