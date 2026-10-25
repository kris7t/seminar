import { describe, expect, it } from 'vitest';

import {
  colophonStart,
  partMarker,
  renderedNote,
  writeColophon,
} from './colophon.ts';
import { CONTENT_END, MARKDOWN_END } from './ids.ts';

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

const markdownSource =
  'Directives use the generic syntax: <code>:name[label]{attributes}</code> inline, <code>::name[label]{attributes}</code> on their own line, and <code>:::name[label]{attributes}</code> … <code>:::</code> around blocks, as documented at <a href="https://seminar.run/guide/getting-started#syntax-at-a-glance">https://seminar.run/guide/getting-started#syntax-at-a-glance</a>.';

const made =
  'This is a slide deck made with <a href="https://seminar.run">Seminar</a> (<a href="https://seminar.run">https://seminar.run</a>)';

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
      `HTML: the <code>&lt;main id="seminar-main"&gt;</code> on lines ${String(lineOf(written, '<details>'))}–${String(lineOf(written, '</main>' + CONTENT_END))}, ending at <code>&lt;!--seminar-content-end--&gt;</code> (within the first 7 KB of the page). Each slide is a <code>&lt;section&gt;</code>, with its speaker notes in an <code>&lt;aside&gt;</code>, and the <code>id</code> of its heading links to it in the deck, e.g., <code>#intro</code>. Interactive components are rendered in place.`,
      'Formulas: there are 2 in the HTML, as MathML <code>&lt;math&gt;</code> with the TeX source in <code>&lt;annotation encoding="application/x-tex"&gt;</code>, so text extraction may show both.',
      'Images: there are 3, 1 without alt text. The image data is base64 PNG/JPEG in <code>&lt;image id="seminar-image-N"&gt;</code> elements inside <code>&lt;svg id="seminar-images"&gt;</code> after the content, which text extraction drops. The HTML shows each image as an <code>&lt;svg role="img"&gt;</code> with the alt text in <code>aria-label</code> and a <code>&lt;use href="#seminar-image-N"&gt;</code>.',
      // Rounded up, so that reading as much doesn't stop short.
      'After the content come fonts, images, and scripts, about 2.6 MB.',
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
      `Markdown: the <code>&lt;pre id="seminar-markdown"&gt;</code> in <code>&lt;main id="seminar-main"&gt;</code> on lines ${String(lineOf(written, '<details>'))}–${String(lineOf(written, '</main>'))}, ending at <code>&lt;!--seminar-content-end--&gt;</code> (within the first 1 KB of the page). ${markdownSource}`,
    ]);
  });

  it('tells the lines of both the Markdown and the document', () => {
    const markdown = `<details><summary>Markdown source</summary><pre>\n## Slide\n\n${'Text\n'.repeat(400)}</pre></details>${MARKDOWN_END}`;
    const html = `${colophonStart({ kind: 'both', title: 'Talk', slides: 1, label: 'About this page', component: 'Step' })}${markdown}\n<main><section><h2 id="slide">Slide</h2>\n<p>Text</p></section></main>${CONTENT_END}`;
    const written = writeColophon(html, {
      images: { count: 1, withoutAlt: 0, embedded: ['SVG'] },
      markdownImages: { count: 1, withoutAlt: 0, embedded: ['SVG'] },
    });
    expect(colophonLines(written)).toEqual([
      `${made}: <cite>Talk</cite>, 1 slide. The page contains it twice: once as Markdown source, and once as rendered HTML.`,
      `Markdown: the <code>&lt;pre id="seminar-markdown"&gt;</code> in <code>&lt;details&gt;</code> on lines ${String(lineOf(written, '<details>'))}–${String(lineOf(written, MARKDOWN_END))}, ending at <code>&lt;!--seminar-markdown-end--&gt;</code> (within the first 4 KB of the page). ${markdownSource} Components such as <code>&lt;Step&gt;</code> appear as written, so anything they compute or keep as state, like their initial values, is not in the Markdown; the HTML below has them rendered in place.`,
      `HTML: the <code>&lt;main id="seminar-main"&gt;</code> on lines ${String(lineOf(written, '<main>'))}–${String(lineOf(written, '</main>'))}, ending at <code>&lt;!--seminar-content-end--&gt;</code> (within the first 4 KB of the page). Each slide is a <code>&lt;section&gt;</code>.`,
      'Images: there is 1, with alt text. The image data is base64 SVG in <code>&lt;image id="seminar-image-N"&gt;</code> elements inside <code>&lt;svg id="seminar-images"&gt;</code> after the content, which text extraction drops. The Markdown refers to each image as <code>![Alt text](#seminar-image-N)</code>, and the HTML shows it as an <code>&lt;svg role="img"&gt;</code> with the alt text in <code>aria-label</code> and a <code>&lt;use href="#seminar-image-N"&gt;</code>.',
    ]);
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
      `HTML: the <code>&lt;main id="seminar-main"&gt;</code> on lines ${String(lineOf(written, '<details>'))}–${String(lineOf(written, '</main>'))}, ending at <code>&lt;!--seminar-content-end--&gt;</code> (within the first 1 KB of the page). Each slide is a <code>&lt;section&gt;</code>. Interactive components are rendered in place.`,
      'Images: there is 1, with alt text. The images are separate files. The HTML shows each image as an <code>&lt;img&gt;</code> with its alt text in <code>alt</code>.',
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
