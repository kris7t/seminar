import { describe, expect, it } from 'vitest';

import {
  colophonStart,
  CONTENT_END,
  partMarker,
  writeColophon,
} from './colophon.ts';

/** Returns the lines of the colophon of `html`. */
function colophonLines(html: string): string[] {
  return (
    /<p id="seminar-colophon" lang="en">([^]*?)<\/p>/.exec(html)?.[1] ?? ''
  )
    .split('<br>\n')
    .map((line) => line.replaceAll('\n', ' '));
}

/** Returns the line of `html` that `text` is on, from 1. */
function lineOf(html: string, text: string): number {
  return html.slice(0, html.indexOf(text)).split('\n').length;
}

describe('writeColophon', () => {
  it('tells where the content and the parts after it are', () => {
    const html =
      `<body>\n<div id="seminar-content">${colophonStart({ kind: 'document', notes: true })}` +
      // A `main` in the content doesn't end it.
      `<main><h1>Talk</h1>\n<main></main>\n<p>${'x'.repeat(5000)}</p></main>${CONTENT_END}</div>\n` +
      `<div id="seminar-root"></div>\n<div>${partMarker('fonts')}<style>@font-face{}</style></div>\n` +
      `${partMarker('images')}<svg id="seminar-images"></svg>\n` +
      `${partMarker('scripts')}<script type="module">${'y'.repeat(2_500_000)}</script>\n</body>`;
    const written = writeColophon(html, {
      images: { count: 3, withoutAlt: 1, embedded: ['PNG', 'JPEG'] },
    });
    const fonts = lineOf(written, '<style>');
    const images = lineOf(written, '<svg id="seminar-images">');
    const scripts = lineOf(written, '<script');
    expect(colophonLines(written)).toEqual([
      `Slide content: <code>&lt;main&gt;</code> on lines ${String(lineOf(written, '<p id='))}–${String(lineOf(written, '</main></div>'))}, with a <code>&lt;section&gt;</code> for each slide, about the first 6 KB. Speaker notes in an <code>&lt;aside&gt;</code> in the section of their slide.`,
      `Images: the slides have 3 images, 1 without alt text. Each is an <code>&lt;svg role="img"&gt;</code> with its alt text in <code>aria-label</code> and its title in <code>&lt;title&gt;</code>, whose <code>&lt;use href="#seminar-image-N"&gt;</code> refers to <code>&lt;image id="seminar-image-N"&gt;</code> in <code>&lt;svg id="seminar-images"&gt;</code> (base64 PNG/JPEG) on line ${String(images)}. Their content is only in the image data, which text extraction leaves out.`,
      // Rounded up, so that reading as much doesn't stop short.
      `Followed by fonts (line ${String(fonts)}), images (line ${String(images)}), and scripts (line ${String(scripts)}), about 2.6 MB.`,
    ]);
    expect(written).not.toContain('<!--');
    // Its lines fit, too.
    expect(
      written
        .slice(0, written.indexOf('<main>'))
        .split('\n')
        .every((line) => line.length <= 100),
    ).toBe(true);
    // The content, with the colophon, is no larger than it says.
    const contentEnd = written.indexOf('</div>\n<div id="seminar-root">');
    expect(Buffer.byteLength(written.slice(0, contentEnd))).toBeLessThanOrEqual(
      6000,
    );
  });

  it('only describes what the page has', () => {
    const html =
      `<div id="seminar-content">${colophonStart({ kind: 'source' })}<main><pre>---\n</pre></main>${CONTENT_END}</div>` +
      '<script type="module" src="./talk.js"></script>';
    const written = writeColophon(html);
    expect(colophonLines(written)).toEqual([
      `The MDX source of the deck: <code>&lt;main&gt;</code> on lines ${String(lineOf(written, '<p id='))}–${String(lineOf(written, '</main>'))}, about the first 1 KB.`,
    ]);
  });

  it('tells about images that are elements of their own', () => {
    const html = `${colophonStart({ kind: 'document' })}<main><p>Slide</p></main>${CONTENT_END}`;
    const written = writeColophon(html, {
      images: { count: 1, withoutAlt: 0 },
    });
    expect(colophonLines(written)).toEqual([
      `Slide content: <code>&lt;main&gt;</code> on lines ${String(lineOf(written, '<p id='))}–${String(lineOf(written, '</main>'))}, with a <code>&lt;section&gt;</code> for each slide, about the first 1 KB.`,
      'Images: the slides have 1 image, with alt text. Each is an <code>&lt;img&gt;</code> with its alt text in <code>alt</code>. Their content is only in the image files, which text extraction leaves out.',
    ]);
  });

  it('leaves pages without the markers of their content as they are', () => {
    const html = `${colophonStart({ kind: 'source' })}<main></main>`;
    expect(writeColophon(html)).toBe(html);
  });
});
