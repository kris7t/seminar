import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createServer, type ViteDevServer } from 'vite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { devServerPlugin, EMBEDDED_QUERY } from './devServerPlugin.ts';

describe('devServerPlugin', () => {
  let root: string;
  let server: ViteDevServer;
  let origin: string;
  const onPages = vi.fn<(count: number) => void>();

  beforeEach(async () => {
    onPages.mockClear();
    root = await mkdtemp(path.join(os.tmpdir(), 'seminar-dev-server-'));
    await writeFile(path.join(root, 'index.html'), '<!doctype html><html>');
    server = await createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0 },
      plugins: [devServerPlugin(onPages)],
    });
    await server.listen();
    const { port } = server.httpServer?.address() as AddressInfo;
    origin = `127.0.0.1:${String(port)}`;
  });

  afterEach(async () => {
    await server.close();
    await rm(root, { recursive: true, force: true });
  });

  async function page(url: string): Promise<string> {
    return (await fetch(`http://${origin}${url}`)).text();
  }

  /** Connects to the dev server like the client of Vite in a page. */
  function connectPage(): WebSocket {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const token = server.config.webSocketToken;
    return new WebSocket(`ws://${origin}/?token=${token}`, 'vite-hmr');
  }

  it('only tells the pages with the query that they are embedded', async () => {
    expect(await page('/')).not.toContain('seminarHost');
    const embedded = await page(`/?${EMBEDDED_QUERY}`);
    expect(embedded).toContain('window.seminarHost = { embedded: true };');
    expect(embedded.indexOf('seminarHost')).toBeLessThan(
      embedded.indexOf('@vite/client'),
    );
  });

  it('counts the connected pages', async () => {
    expect(onPages).toHaveBeenLastCalledWith(0);
    const socket = connectPage();
    await vi.waitFor(() => {
      expect(onPages).toHaveBeenLastCalledWith(1);
    });
    socket.close();
    await vi.waitFor(() => {
      expect(onPages).toHaveBeenLastCalledWith(0);
    });
  });

  it('keeps counting after Vite restarts', async () => {
    await server.restart();
    const socket = connectPage();
    await vi.waitFor(() => {
      expect(onPages).toHaveBeenLastCalledWith(1);
    });
    socket.close();
  });
});
