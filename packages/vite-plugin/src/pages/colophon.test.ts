import { describe, expect, it } from 'vitest';

import {
  colophonStart,
  CONTENT_END,
  partMarker,
  renderedNote,
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

const made = 'A slide deck made with <a href="https://seminar.run">Seminar</a>';

describe('writeColophon', () => {
  it('tells what the page is, where its content is, and what follows it', () => {
    const html =
      `<body>\n<div id="seminar-content">${colophonStart({
        kind: 'document',
        title: 'A <talk> about `code` {and} more',
        lang: 'hu',
        slides: 12,
        example: 'intro',
        notes: true,
        formulas: 2,
      })}` +
      // A `main` in the content doesn't end it.
      `<main><h1>Talk</h1>\n<main></main>\n<p>{size} {title}</p>\n<p>${'x'.repeat(5000)}</p></main>${CONTENT_END}</div>\n` +
      `<div id="seminar-root"></div>\n<div>${partMarker('fonts')}<style>@font-face{}</style></div>\n` +
      `${partMarker('images')}<svg id="seminar-images"></svg>\n` +
      `${partMarker('scripts')}<script type="module">${'y'.repeat(2_500_000)}</script>\n</body>`;
    const written = writeColophon(html, {
      images: { count: 3, withoutAlt: 1, embedded: ['PNG', 'JPEG'] },
    });
    expect(colophonLines(written)).toEqual([
      `${made}: <cite lang="hu">A &lt;talk&gt; about \`code\` {and} more</cite>, 12 slides in Hungarian.`,
      `Slide content: <code>&lt;main&gt;</code> on lines ${String(lineOf(written, '<p id='))}–${String(lineOf(written, '</main>' + CONTENT_END))} up to <code>&lt;!--seminar-content-end--&gt;</code>, with a <code>&lt;section&gt;</code> for each slide, about the first 7 KB. Speaker notes in an <code>&lt;aside&gt;</code> in the section of their slide.`,
      'The <code>id</code> of the heading of each slide is its link in the deck, e.g., <code>#intro</code>.',
      'Formulas: the slides have 2, each a MathML <code>&lt;math&gt;</code> with its TeX source in <code>&lt;annotation encoding="application/x-tex"&gt;</code>. Text extraction may give both, one after the other.',
      'Images: the slides have 3 images, 1 without alt text. Each is an <code>&lt;svg role="img"&gt;</code> with its alt text in <code>aria-label</code> and its title in <code>&lt;title&gt;</code>, whose <code>&lt;use href="#seminar-image-N"&gt;</code> refers to <code>&lt;image id="seminar-image-N"&gt;</code> in <code>&lt;svg id="seminar-images"&gt;</code> (base64 PNG/JPEG) after the slides. Their content is only in the image data, which text extraction leaves out.',
      // Rounded up, so that reading as much doesn't stop short.
      'Followed by fonts, images, and scripts, about 2.6 MB.',
    ]);
    // Only the end of the content stays marked.
    expect(written.match(/<!--[^]*?-->/g)).toEqual([CONTENT_END]);
    expect(written).toContain(`</main>${CONTENT_END}</div>`);
    // The content stays as it is.
    expect(written).toContain('<p>{size} {title}</p>');
    // Its lines fit, too.
    expect(
      written
        .slice(0, written.indexOf('<main>'))
        .split('\n')
        .every((line) => line.length <= 100),
    ).toBe(true);
    // The content, with the colophon, is no larger than it says.
    const contentEnd = written.indexOf(CONTENT_END);
    expect(Buffer.byteLength(written.slice(0, contentEnd))).toBeLessThanOrEqual(
      7000,
    );
  });

  it('only describes what the page has', () => {
    const html =
      `<div id="seminar-content">${colophonStart({ kind: 'source', title: 'Talk' })}<main><pre>---\n</pre></main>${CONTENT_END}</div>` +
      '<script type="module" src="./talk.js"></script>';
    const written = writeColophon(html);
    expect(colophonLines(written)).toEqual([
      `${made}: <cite>Talk</cite>.`,
      `The MDX source of the deck: <code>&lt;main&gt;</code> on lines ${String(lineOf(written, '<p id='))}–${String(lineOf(written, '</main>'))} up to <code>&lt;!--seminar-content-end--&gt;</code>, about the first 1 KB.`,
    ]);
  });

  it('tells about images that are elements of their own', () => {
    const html = `${colophonStart({ kind: 'document', title: 'Talk', slides: 1 })}<main><p>Slide</p></main>${CONTENT_END}`;
    const written = writeColophon(html, {
      images: { count: 1, withoutAlt: 0 },
    });
    expect(colophonLines(written)).toEqual([
      `${made}: <cite>Talk</cite>, 1 slide.`,
      `Slide content: <code>&lt;main&gt;</code> on lines ${String(lineOf(written, '<p id='))}–${String(lineOf(written, '</main>'))} up to <code>&lt;!--seminar-content-end--&gt;</code>, with a <code>&lt;section&gt;</code> for each slide, about the first 1 KB.`,
      'Images: the slides have 1 image, with alt text. Each is an <code>&lt;img&gt;</code> with its alt text in <code>alt</code>. Their content is only in the image files, which text extraction leaves out.',
    ]);
  });

  it('leaves pages without the markers of their content as they are', () => {
    const html = `${colophonStart({ kind: 'source', title: 'Talk' })}<main></main>`;
    expect(writeColophon(html)).toBe(html);
  });
});

describe('renderedNote', () => {
  it('tells where the rendered slides are, on the last line', () => {
    expect(renderedNote('seminar-root')).toBe(
      '<br><span id="seminar-colophon-rendered"><code>&lt;div id="seminar-root"&gt;</code> after the content has the slides as the browser rendered them.</span>',
    );
  });
});
