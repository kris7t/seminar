import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createServer, type ViteDevServer } from 'vite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  devServerPlugin,
  EMBEDDED_QUERY,
  type ChannelMessage,
  type DevServerPlugin,
} from './devServerPlugin.ts';

describe('devServerPlugin', () => {
  let root: string;
  let server: ViteDevServer;
  let origin: string;
  let plugin: DevServerPlugin;
  const onPages = vi.fn<(count: number) => void>();
  const onChannel = vi.fn<(message: ChannelMessage) => void>();
  const sockets: WebSocket[] = [];

  beforeEach(async () => {
    onPages.mockClear();
    onChannel.mockClear();
    root = await mkdtemp(path.join(os.tmpdir(), 'seminar-dev-server-'));
    await writeFile(path.join(root, 'index.html'), '<!doctype html><html>');
    plugin = devServerPlugin({ onPages, onChannel });
    server = await createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0 },
      plugins: [plugin],
    });
    await server.listen();
    const { port } = server.httpServer?.address() as AddressInfo;
    origin = `127.0.0.1:${String(port)}`;
  });

  afterEach(async () => {
    for (const socket of sockets.splice(0)) {
      socket.close();
    }
    await server.close();
    await rm(root, { recursive: true, force: true });
  });

  async function page(url: string): Promise<string> {
    return (await fetch(`http://${origin}${url}`)).text();
  }

  /** Connects to the dev server like the client of Vite in a page. */
  async function connectPage() {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const token = server.config.webSocketToken;
    const socket = new WebSocket(`ws://${origin}/?token=${token}`, 'vite-hmr');
    sockets.push(socket);
    const received: unknown[] = [];
    socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data as string) as {
        type: string;
        data?: unknown;
      };
      if (message.type === 'custom') {
        received.push(message.data);
      }
    });
    await new Promise((resolve) => {
      socket.addEventListener('open', resolve);
    });
    return {
      socket,
      received,
      send: (data: ChannelMessage) => {
        socket.send(
          JSON.stringify({ type: 'custom', event: 'seminar:channel', data }),
        );
      },
    };
  }

  it('only tells the pages with the query that they are embedded', async () => {
    expect(await page('/')).not.toContain('seminarHost');
    const embedded = await page(`/?${EMBEDDED_QUERY}`);
    expect(embedded).toContain('window.seminarHost = { embedded: true };');
    expect(embedded.indexOf('seminarHost')).toBeLessThan(
      embedded.indexOf('@vite/client'),
    );
  });

  it('gives pages the channel, with the hot updates of Vite', async () => {
    const html = await page('/');
    const [, src] = /src="([^"]*seminar-dev-channel)"/.exec(html) ?? [];
    expect(src).toBeDefined();
    const channel = await page(src ?? '');
    expect(channel).toContain('seminar.devChannel');
    expect(channel).toContain('createHotContext');
  });

  it('counts the connected pages', async () => {
    expect(onPages).toHaveBeenLastCalledWith(0);
    const { socket } = await connectPage();
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
    await connectPage();
    await vi.waitFor(() => {
      expect(onPages).toHaveBeenLastCalledWith(1);
    });
  });

  it('passes messages of a page to the editor and the other pages', async () => {
    const sender = await connectPage();
    const other = await connectPage();
    const message = { page: '/talk.html', event: 'location', data: 1 };
    sender.send(message);
    await vi.waitFor(() => {
      expect(onChannel).toHaveBeenCalledWith(message);
      expect(other.received).toEqual([message]);
    });
    expect(sender.received).toEqual([]);
  });

  it('sends messages of the editor to all pages', async () => {
    const page = await connectPage();
    const message = { page: '/talk.html', event: 'goToSlide', data: 1 };
    plugin.sendToPages(message);
    await vi.waitFor(() => {
      expect(page.received).toEqual([message]);
    });
  });
});
