import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { createBuilder, defaultClientConditions } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';

import slider, { type SliderPluginOptions } from './index.ts';

const root = fileURLToPath(new URL('fixtures', import.meta.url));

let outDir: string | undefined;

afterEach(async () => {
  if (outDir !== undefined) {
    await rm(outDir, { recursive: true, force: true });
  }
});

/** Builds the fixtures like `vite build` and returns the output files. */
async function buildApp(options?: SliderPluginOptions) {
  outDir = await mkdtemp(path.join(tmpdir(), 'slider-build-'));
  const builder = await createBuilder({
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: [
      slider({ plugins: ['@slider/plugin-mathjax'], ...options }),
      react(),
    ],
    resolve: {
      conditions: ['@slider/source', ...defaultClientConditions],
    },
    build: { outDir, emptyOutDir: true },
  });
  await builder.buildApp();
  const files = await readdir(outDir, { recursive: true });
  const html = await readFile(path.join(outDir, 'talk.html'), 'utf8');
  return { files: files.sort(), html };
}

describe('sliderSelfContained', () => {
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
    expect(markup).not.toMatch(/\s(src|href)=/);
    // The fonts of the theme, without WOFF fallbacks and unused subsets.
    expect(html).toContain('data:font/woff2;base64,');
    expect(html).not.toContain('data:font/woff;base64,');
    expect(html).not.toMatch(/unicode-range:[^;}]*U\+0?400-0?45F/i);
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
  }, 60_000);
});
