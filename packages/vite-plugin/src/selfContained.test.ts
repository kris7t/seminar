import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import {
  createBuilder,
  defaultClientConditions,
  defaultServerConditions,
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
async function buildApp(options?: SeminarPluginOptions) {
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
    ssr: {
      resolve: {
        conditions: ['@seminar/source', ...defaultServerConditions],
      },
    },
    build: { outDir, emptyOutDir: true },
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
    // Only links to the slides of the page.
    expect(markup).not.toMatch(/\s(src|href)="(?!#)/);
    // The fonts of the theme, without WOFF fallbacks and unused subsets.
    expect(html).toContain('data:font/woff2;base64,');
    expect(html).not.toContain('data:font/woff;base64,');
    expect(html).not.toMatch(/unicode-range:[^;}]*U\+0?400-0?45F/i);
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
  }, 60_000);
});
