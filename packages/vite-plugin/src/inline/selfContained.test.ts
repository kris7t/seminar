import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import {
  createBuilder,
  defaultClientConditions,
  type BuildEnvironmentOptions,
} from 'vite';
import { afterEach, describe, expect, it } from 'vitest';

import seminar, { type SeminarPluginOptions } from '../index.ts';

const root = fileURLToPath(new URL('../test/fixtures', import.meta.url));

let outDir: string | undefined;

afterEach(async () => {
  if (outDir !== undefined) {
    await rm(outDir, { recursive: true, force: true });
  }
});

/** Builds the fixtures like `vite build` and returns the output files. */
async function buildApp(
  options?: SeminarPluginOptions,
  build?: BuildEnvironmentOptions,
) {
  outDir = await mkdtemp(path.join(tmpdir(), 'seminar-build-'));
  const builder = await createBuilder({
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: [
      seminar({ plugins: ['@seminar/plugin-mathjax'], ...options }),
      react(),
    ],
    resolve: {
      conditions: ['@seminar/source', ...defaultClientConditions],
    },
    build: { ...build, outDir, emptyOutDir: true },
  });
  await builder.buildApp();
  const files = await readdir(outDir, { recursive: true });
  const html = await readFile(path.join(outDir, 'talk.html'), 'utf8');
  return { files: files.sort(), html };
}

describe('seminarSelfContained', () => {
  it('builds decks into self-contained pages', async () => {
    const { files, html } = await buildApp();
    expect(files).toEqual(['talk.html']);
    expect(html).toContain('<script type="module">');
    expect(html).toContain('<style>');
    // No references to other files outside of the inlined code.
    const markup = html.replaceAll(
      /<(script|style)\b[^>]*>[\s\S]*?<\/\1>/g,
      '<$1></$1>',
    );
    // Only links within the page, and embedded images.
    expect(markup).not.toMatch(/\s(src|href)="(?!#|data:|https:\/\/)/);
    // The fonts of the theme, without WOFF fallbacks and unused subsets.
    expect(html).toContain('data:font/woff2;base64,');
    expect(html).not.toContain('data:font/woff;base64,');
    expect(html).not.toMatch(/unicode-range:[^;}]*U\+0?400-0?45F/i);
  }, 60_000);

  it('embeds images once for the document and the slides', async () => {
    const { html } = await buildApp({ content: 'ssr' });
    const data =
      /<image id="seminar-image-0" href="(data:image\/svg\+xml;base64,[^"]+)" width="120" height="60"\/>/.exec(
        html,
      )?.[1];
    expect(data).toBeDefined();
    expect(html.split(data ?? '').length - 1).toBe(1);
    // After the deck and its styles.
    expect(html.search(/<svg id="seminar-images" aria-hidden/)).toBeGreaterThan(
      html.indexOf('<div id="seminar-emotion">'),
    );
    expect(html).toContain(
      '<div id="end-diagram"><svg role="img" aria-label="A diagram" width="120" height="60" viewBox="0 0 120 60"><title>A diagram</title><use href="#seminar-image-0"/></svg></div>',
    );
    // The colophon tells what follows the content.
    const colophon = (
      /<p id="seminar-colophon" lang="en">([^]*?)<\/p>/.exec(html)?.[1] ?? ''
    ).replaceAll('\n', ' ');
    expect(colophon).toMatch(
      /^A slide deck made with <a href="https:\/\/seminar\.run">Seminar<\/a> \(<a href="https:\/\/seminar\.run">https:\/\/seminar\.run<\/a>\): <cite>A talk about slides<\/cite>, 4 slides\.<br> Slide content: <code>&lt;main&gt;<\/code> on lines \d+–\d+ up to <code>&lt;!--seminar-content-end--&gt;<\/code>, with a <code>&lt;section&gt;<\/code> for each slide, about the first \d+ KB\.<br> The <code>id<\/code> of the heading of each slide is its link in the deck, e\.g\., <code>#a-talk-about-slides<\/code>\.<br> Interactive components are rendered in <code>&lt;main&gt;<\/code> as they first appear, with all of their steps shown\.<br> Formulas: the slides have 1, each a MathML <code>&lt;math&gt;<\/code> with its TeX source in <code>&lt;annotation encoding="application\/x-tex"&gt;<\/code>\. Text extraction may give both, one after the other\.<br> Images: the slides have 1 image, with alt text\. .* \(base64 SVG\) after the slides\. Their content is only in the image data, which text extraction leaves out\.<br> Followed by fonts, images, and scripts, about [\d.]+ [KM]B\.$/,
    );
    // The lines of the content are right.
    const line = (text: string) =>
      html.slice(0, html.indexOf(text)).split('\n').length;
    expect(/on lines (\d+)–(\d+)/.exec(colophon)?.slice(1).map(Number)).toEqual(
      [line('<details>'), line('</main><!--seminar-content-end-->')],
    );
    // Without empty lines where the inlined tags were.
    expect(html.slice(0, html.indexOf('</head>'))).not.toMatch(/\n\s*\n/);
    expect(html).not.toMatch(/<!--seminar-(?!content-end-->)/);
    // The slides look the image up instead of having it in the script.
    expect(html).toMatch(/getElementById\([`"']seminar-image-0[`"']\)/);
  }, 60_000);

  it('refers to the embedded images in the Markdown of the deck', async () => {
    const { html } = await buildApp({ content: 'markdown' });
    expect(html).toContain(
      '![A diagram](#seminar-image-0){#diagram}\n</pre></main>',
    );
    expect(html).toMatch(
      /<image id="seminar-image-0" href="data:image\/svg\+xml;base64,[^"]+"/,
    );
    const colophon = (
      /<p id="seminar-colophon" lang="en">([^]*?)<\/p>/.exec(html)?.[1] ?? ''
    ).replaceAll('\n', ' ');
    expect(colophon).toContain(
      '<br> Directives in the Markdown: <code>:name[label]{attributes}</code> in text, <code>::name[label]{attributes}</code> on a line of its own, and <code>:::name[label]{attributes}</code> up to <code>:::</code> around blocks, see the syntax of decks (<a href="https://seminar.run/guide/getting-started#syntax-at-a-glance">https://seminar.run/guide/getting-started#syntax-at-a-glance</a>).<br> Images: the Markdown has 1 image whose URL refers to an image embedded after the content, e.g., <code>![Alt text](#seminar-image-N)</code> to <code>&lt;image id="seminar-image-N"&gt;</code> in <code>&lt;svg id="seminar-images"&gt;</code> (base64 SVG). Their content is only in the image data in <code>href</code>, which text extraction leaves out.<br>',
    );
    // The slides look the image up, too.
    expect(html).toMatch(/getElementById\([`"']seminar-image-0[`"']\)/);
  }, 60_000);

  it('embeds images once for both the document and the Markdown', async () => {
    const { html } = await buildApp({ content: 'both' });
    expect(html).toContain('![A diagram](#seminar-image-0){#diagram}');
    expect(html).toContain('<use href="#seminar-image-0"/>');
    expect(html.match(/<image id="seminar-image-\d+"/g)).toHaveLength(1);
    const colophon = (
      /<p id="seminar-colophon" lang="en">([^]*?)<\/p>/.exec(html)?.[1] ?? ''
    ).replaceAll('\n', ' ');
    expect(colophon).toMatch(
      /<br> Images: the Markdown has 1 image whose URL refers to an image embedded after the content[^]*<br> Slide content: [^]*<br> Images: the slides have 1 image, with alt text\. /,
    );
  }, 60_000);

  it('embeds images into the document in other modes', async () => {
    const { html } = await buildApp({ selfContained: false });
    expect(html).toMatch(
      /<div id="end-diagram"><img src="data:image\/svg\+xml;base64,[^"]+" alt="A diagram"\/><\/div>/,
    );
    expect(html).not.toContain('seminar-images');
  }, 60_000);

  it('refers to the assets of images in the document in other modes', async () => {
    const { files, html } = await buildApp(
      { selfContained: false },
      { assetsInlineLimit: 0 },
    );
    const asset = files.find((file) => /^assets\/diagram-.*\.svg$/.test(file));
    expect(asset).toBeDefined();
    expect(html).toContain(
      `<div id="end-diagram"><img src="/${asset ?? ''}" alt="A diagram"/></div>`,
    );
  }, 60_000);

  it('links to the assets of images in the Markdown in other modes', async () => {
    const { files, html } = await buildApp(
      { content: 'markdown', selfContained: false },
      { assetsInlineLimit: 0 },
    );
    const asset = files.find((file) => /^assets\/diagram-.*\.svg$/.test(file));
    expect(asset).toBeDefined();
    expect(html).toContain(`![A diagram](/${asset ?? ''}){#diagram}`);
    expect(html).not.toContain('seminar-images');
    expect(html.replaceAll('\n', ' ')).toContain(
      'Images: the Markdown has 1 image whose URL refers to the image file. Their content is only in the image files.',
    );
  }, 60_000);

  it('links to images next to the deck in the Markdown if they are inlined', async () => {
    const { html } = await buildApp({
      content: 'markdown',
      selfContained: false,
    });
    expect(html).toContain('![A diagram](diagram.svg){#diagram}');
    expect(html).not.toMatch(/<pre>[^]*data:image/);
  }, 60_000);

  it('puts the inlined code into the body after the deck', async () => {
    const { html } = await buildApp();
    const head = html.slice(0, html.indexOf('<body>'));
    expect(head).not.toContain('<script');
    expect(head.length).toBeLessThan(1000);
    const body = html.slice(html.indexOf('<body>'));
    const content = body.indexOf('<div id="seminar-content">');
    const root = body.indexOf('<div id="seminar-root"></div>');
    const stylesheets = body.indexOf('<div id="seminar-stylesheets">\n<style>');
    const emotion = body.indexOf('<div id="seminar-emotion"></div>');
    const script = body.indexOf('<script type="module">');
    expect(content).toBeGreaterThan(0);
    expect(root).toBeGreaterThan(content);
    expect(stylesheets).toBeGreaterThan(root);
    expect(emotion).toBeGreaterThan(stylesheets);
    expect(script).toBeGreaterThan(emotion);
  }, 60_000);

  it('keeps the requested Unicode ranges', async () => {
    const { html } = await buildApp({
      selfContained: { keepUnicodeRanges: ['U+0416'] },
    });
    expect(html).toMatch(/unicode-range:[^;}]*U\+0?400-0?45F/i);
  }, 60_000);

  it('can be disabled', async () => {
    const { files, html } = await buildApp({ selfContained: false });
    expect(files).toContain('talk.html');
    expect(files.some((file) => file.endsWith('.js'))).toBe(true);
    expect(html).toMatch(/<script type="module" crossorigin src=/);
    // Only the build of the client, which has every file the page refers to.
    const references = [...html.matchAll(/\s(?:src|href)="\/([^"]+)"/g)].map(
      ([, file]) => file,
    );
    expect(references.length).toBeGreaterThan(0);
    expect(files).toEqual(expect.arrayContaining(references));
  }, 60_000);
});
