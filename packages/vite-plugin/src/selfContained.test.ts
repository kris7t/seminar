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

import seminar, { type SeminarPluginOptions } from './index.ts';

const root = fileURLToPath(new URL('fixtures', import.meta.url));

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
    expect(markup).not.toMatch(/\s(src|href)="(?!#|data:)/);
    // The fonts of the theme, without WOFF fallbacks and unused subsets.
    expect(html).toContain('data:font/woff2;base64,');
    expect(html).not.toContain('data:font/woff;base64,');
    expect(html).not.toMatch(/unicode-range:[^;}]*U\+0?400-0?45F/i);
  }, 60_000);

  it('embeds images once for the document and the slides', async () => {
    const { html } = await buildApp();
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
    expect(html).toMatch(
      /<p id="seminar-colophon" lang="en">Slide content: <code>&lt;main&gt;<\/code>, about the first \d+ KB\.<br>Images: .* \(base64 SVG\) after the slides\.<br>Followed by images, fonts, and scripts \(about [\d.]+ [KM]B\)\.<\/p>/,
    );
    expect(html).not.toContain('<!--seminar-');
    // The slides look the image up instead of having it in the script.
    expect(html).toMatch(/getElementById\([`"']seminar-image-0[`"']\)/);
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
