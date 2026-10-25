import { describe, expect, it } from 'vitest';

import {
  colophonStart,
  CONTENT_END,
  MARKDOWN_END,
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

const directives =
  'Directives in the Markdown: <code>:name[label]{attributes}</code> in text, <code>::name[label]{attributes}</code> on a line of its own, and <code>:::name[label]{attributes}</code> up to <code>:::</code> around blocks, see the syntax of decks (<a href="https://seminar.run/guide/getting-started#syntax-at-a-glance">https://seminar.run/guide/getting-started#syntax-at-a-glance</a>).';

const interactive =
  'Interactive components are rendered in <code>&lt;main&gt;</code> as they first appear.';

const interactiveBoth =
  'Components in the Markdown, e.g., <code>&lt;Step&gt;</code>, may be interactive; each is rendered in <code>&lt;main&gt;</code> as it first appears.';

const made =
  'A slide deck made with <a href="https://seminar.run">Seminar</a> (<a href="https://seminar.run">https://seminar.run</a>)';

describe('writeColophon', () => {
  it('tells what the page is, where its content is, and what follows it', () => {
    const html =
      `<body>\n<div id="seminar-content">${colophonStart({
        kind: 'document',
        title: 'A <talk> about `code` {and} more',
        lang: 'hu',
        label: 'Az oldalról',
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
      `Slide content: <code>&lt;main&gt;</code> on lines ${String(lineOf(written, '<details>'))}–${String(lineOf(written, '</main>' + CONTENT_END))} up to <code>&lt;!--seminar-content-end--&gt;</code>, with a <code>&lt;section&gt;</code> for each slide, about the first 7 KB. Speaker notes in an <code>&lt;aside&gt;</code> in the section of their slide.`,
      'The <code>id</code> of the heading of each slide is its link in the deck, e.g., <code>#intro</code>.',
      interactive,
      'Formulas: the slides have 2, each a MathML <code>&lt;math&gt;</code> with its TeX source in <code>&lt;annotation encoding="application/x-tex"&gt;</code>. Text extraction may give both, one after the other.',
      'Images: the slides have 3 images, 1 without alt text. Each is an <code>&lt;svg role="img"&gt;</code> with its alt text in <code>aria-label</code> and its title in <code>&lt;title&gt;</code>, whose <code>&lt;use href="#seminar-image-N"&gt;</code> refers to <code>&lt;image id="seminar-image-N"&gt;</code> in <code>&lt;svg id="seminar-images"&gt;</code> (base64 PNG/JPEG) after the slides. Their content is only in the image data, which text extraction leaves out.',
      // Rounded up, so that reading as much doesn't stop short.
      'Followed by fonts, images, and scripts, about 2.6 MB.',
    ]);
    // Collapsed under its label, before the content.
    expect(written).toContain(
      '<div id="seminar-content">\n<details><summary>Az oldalról</summary>\n<p id="seminar-colophon" lang="en">',
    );
    expect(written).toContain('</p>\n</details>\n<main>');
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
      `<div id="seminar-content">${colophonStart({ kind: 'markdown', title: 'Talk', label: 'About this page' })}<main><pre>---\n</pre></main>${CONTENT_END}</div>` +
      '<script type="module" src="./talk.js"></script>';
    const written = writeColophon(html);
    expect(colophonLines(written)).toEqual([
      `${made}: <cite>Talk</cite>.`,
      `The Markdown source of the deck, without comments and with the slides it includes from other decks: <code>&lt;main&gt;</code> on lines ${String(lineOf(written, '<details>'))}–${String(lineOf(written, '</main>'))} up to <code>&lt;!--seminar-content-end--&gt;</code>, about the first 1 KB.`,
      directives,
    ]);
  });

  it('tells the lines of both the Markdown and the document', () => {
    const markdown = `<details><summary>Markdown source</summary><pre>\n## Slide\n\n${'Text\n'.repeat(400)}</pre></details>${MARKDOWN_END}`;
    const html = `${colophonStart({ kind: 'both', title: 'Talk', slides: 1, label: 'About this page', component: 'Step' })}${markdown}\n<main><section><h2 id="slide">Slide</h2>\n<p>Text</p></section></main>${CONTENT_END}`;
    const written = writeColophon(html, {
      images: { count: 1, withoutAlt: 0, embedded: ['SVG'] },
      markdownImages: { count: 1, withoutAlt: 0, embedded: ['SVG'] },
    });
    const lines = colophonLines(written);
    expect(lines.slice(1, 3)).toEqual([
      `The Markdown source of the deck, without comments and with the slides it includes from other decks: <code>&lt;pre&gt;</code> in <code>&lt;details&gt;</code> on lines ${String(lineOf(written, '<details>'))}–${String(lineOf(written, MARKDOWN_END))} up to <code>&lt;!--seminar-markdown-end--&gt;</code>, about the first 5 KB.`,
      directives,
    ]);
    expect(lines[3]).toMatch(
      /^Images: the Markdown has 1 image whose URL refers to an image embedded after the content/,
    );
    expect(lines[4]).toBe(
      `Slide content: <code>&lt;main&gt;</code> on lines ${String(lineOf(written, '<main>'))}–${String(lineOf(written, '</main>'))} up to <code>&lt;!--seminar-content-end--&gt;</code>, with a <code>&lt;section&gt;</code> for each slide, about the first 5 KB.`,
    );
    expect(lines[5]).toBe(interactiveBoth);
    expect(lines[6]).toMatch(/^Images: the slides have 1 image/);
    expect(written).toContain(`</pre></details>${MARKDOWN_END}\n<main>`);
  });

  it('tells about images that are elements of their own', () => {
    const html = `${colophonStart({ kind: 'document', title: 'Talk', slides: 1, label: 'About this page', labelLang: 'en' })}<main><p>Slide</p></main>${CONTENT_END}`;
    const written = writeColophon(html, {
      images: { count: 1, withoutAlt: 0 },
    });
    // Its label is marked if it's in another language than the deck.
    expect(written).toContain(
      '<details><summary lang="en">About this page</summary>',
    );
    expect(colophonLines(written)).toEqual([
      `${made}: <cite>Talk</cite>, 1 slide.`,
      `Slide content: <code>&lt;main&gt;</code> on lines ${String(lineOf(written, '<details>'))}–${String(lineOf(written, '</main>'))} up to <code>&lt;!--seminar-content-end--&gt;</code>, with a <code>&lt;section&gt;</code> for each slide, about the first 1 KB.`,
      interactive,
      'Images: the slides have 1 image, with alt text. Each is an <code>&lt;img&gt;</code> with its alt text in <code>alt</code>. Their content is only in the image files, which text extraction leaves out.',
    ]);
  });

  it('leaves pages without the markers of their content as they are', () => {
    const html = `${colophonStart({ kind: 'markdown', title: 'Talk', label: 'About this page' })}<main></main>`;
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
