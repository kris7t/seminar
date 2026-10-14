import { createServer as createHttpServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import {
  build,
  createServer,
  defaultClientConditions,
  type InlineConfig,
  type Rolldown,
  type ViteDevServer,
} from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import slider from './index.ts';

const root = fileURLToPath(new URL('fixtures', import.meta.url));

const config: InlineConfig = {
  root,
  configFile: false,
  logLevel: 'silent',
  plugins: [slider(), react()],
  resolve: {
    conditions: ['@slider/source', ...defaultClientConditions],
  },
};

describe('sliderEntries', () => {
  describe('build', () => {
    let output: Rolldown.RolldownOutput;

    beforeAll(async () => {
      const result = await build({ ...config, build: { write: false } });
      output = (Array.isArray(result) ? result[0] : result) as typeof output;
    }, 60_000);

    it('generates a page for each deck', () => {
      const page = output.output.find((file) => file.fileName === 'talk.html');
      expect(page?.type).toBe('asset');
      const html = page?.type === 'asset' ? String(page.source) : '';
      expect(html).toContain('<title>A talk about slides</title>');
      expect(html).toMatch(
        /<script type="module" crossorigin src="[^"]+\.js">/,
      );
    });

    it('bundles the deck', () => {
      expect(
        output.output.some((file) => file.type === 'chunk' && file.isEntry),
      ).toBe(true);
    });

    it('renders math with the font of the TypeScript theme', () => {
      const code = output.output
        .map((file) => (file.type === 'chunk' ? file.code : ''))
        .join('');
      expect(code).toMatch(/MJX-\d+-FIRA-/);
      expect(code).not.toMatch(/MJX-\d+-NCM-/);
    });
  });

  describe('dev server', () => {
    let server: ViteDevServer;
    let httpServer: Server;
    let baseUrl: string;

    beforeAll(async () => {
      server = await createServer({
        ...config,
        appType: 'mpa',
        server: { middlewareMode: true },
      });
      httpServer = createHttpServer(server.middlewares);
      await new Promise<void>((resolve) => {
        httpServer.listen(0, '127.0.0.1', resolve);
      });
      const { port } = httpServer.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${String(port)}`;
    });

    afterAll(async () => {
      await new Promise((resolve) => httpServer.close(resolve));
      await server.close();
    });

    it('serves a page for each deck', async () => {
      const response = await fetch(`${baseUrl}/talk.html`);
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain('<title>A talk about slides</title>');
      expect(html).toContain('src="./talk.deck.mdx?slider-entry"');
    });

    it('serves the script that renders the deck', async () => {
      const response = await fetch(`${baseUrl}/talk.deck.mdx?slider-entry`);
      expect(response.status).toBe(200);
      const code = await response.text();
      expect(code).toContain('createRoot');
      expect(code).toContain('talk.deck.mdx');
    });

    it('does not serve pages for other files', async () => {
      const response = await fetch(`${baseUrl}/missing.html`);
      expect(response.status).toBe(404);
    });
  });
});
