import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DevServers,
  runSeminarDev,
  type ChannelMessage,
  type DevServerEvents,
} from './devServers.ts';

describe('DevServers', () => {
  let started: (DevServerEvents & { project: string; stop: () => void })[];
  let servers: DevServers;
  let sent: unknown[];

  beforeEach(() => {
    vi.useFakeTimers();
    started = [];
    sent = [];
    servers = new DevServers((project, events) => {
      const stop = vi.fn();
      started.push({ project, ...events, stop });
      return Promise.resolve({
        url: `http://${project}/`,
        root: project,
        send: (message) => {
          sent.push([project, message]);
        },
        stop,
      });
    });
  });

  afterEach(() => {
    servers.dispose();
    vi.useRealTimers();
  });

  /** Waits for the idle time of unused dev servers, and what they do then. */
  async function waitUntilIdle() {
    await vi.advanceTimersByTimeAsync(120_000);
  }

  it('shares a dev server in a project', async () => {
    const [one, two, other] = await Promise.all([
      servers.acquire('a'),
      servers.acquire('a'),
      servers.acquire('b'),
    ]);
    expect(started.map(({ project }) => project)).toEqual(['a', 'b']);
    expect(one.url).toBe(two.url);
    expect(other.url).toBe('http://b/');
  });

  it('stops some time after the last lease is released', async () => {
    const one = await servers.acquire('a');
    const two = await servers.acquire('a');
    one.release();
    await waitUntilIdle();
    expect(started[0]?.stop).not.toHaveBeenCalled();
    two.release();
    two.release();
    expect(started[0]?.stop).not.toHaveBeenCalled();
    await waitUntilIdle();
    expect(started[0]?.stop).toHaveBeenCalledOnce();
    await servers.acquire('a');
    expect(started).toHaveLength(2);
  });

  it('is kept if used again in time', async () => {
    (await servers.acquire('a')).release();
    await vi.advanceTimersByTimeAsync(1000);
    await servers.acquire('a');
    await waitUntilIdle();
    expect(started).toHaveLength(1);
    expect(started[0]?.stop).not.toHaveBeenCalled();
  });

  it('is kept while pages are connected to it', async () => {
    (await servers.acquire('a')).release();
    started[0]?.onPages(1);
    await waitUntilIdle();
    expect(started[0]?.stop).not.toHaveBeenCalled();
    started[0]?.onPages(0);
    await waitUntilIdle();
    expect(started[0]?.stop).toHaveBeenCalledOnce();
  });

  it('starts again after stopping by itself, telling the leases', async () => {
    const lease = await servers.acquire('a');
    started[0]?.onExit();
    await expect(lease.exited).resolves.toBeUndefined();
    await servers.acquire('a');
    expect(started).toHaveLength(2);
  });

  it('tries again after failing to start', async () => {
    let attempts = 0;
    const failing = new DevServers(() => {
      attempts += 1;
      return Promise.reject(new Error('No Vite'));
    });
    await expect(failing.acquire('a')).rejects.toThrow('No Vite');
    await expect(failing.acquire('a')).rejects.toThrow('No Vite');
    expect(attempts).toBe(2);
  });

  it('only sends messages to running dev servers', async () => {
    const message = { page: '/talk.html', event: 'goToSlide', data: 1 };
    servers.send('a', message);
    await servers.acquire('a');
    servers.send('a', message);
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toEqual([['a', message]]);
  });

  it('stops all dev servers when disposed', async () => {
    await Promise.all([servers.acquire('a'), servers.acquire('b')]);
    servers.dispose();
    await vi.advanceTimersByTimeAsync(0);
    expect(started.map(({ stop }) => stop)).toSatisfy((stops: unknown[]) =>
      stops.every((stop) => vi.mocked(stop as () => void).mock.calls.length),
    );
  });
});

describe('runSeminarDev', () => {
  let project: string;

  beforeEach(async () => {
    project = await mkdtemp(path.join(tmpdir(), 'seminar-vscode-'));
  });

  afterEach(async () => {
    await rm(project, { recursive: true, force: true });
  });

  async function cli(script: string): Promise<string> {
    const file = path.join(project, 'cli.cjs');
    await writeFile(file, script);
    await chmod(file, 0o755);
    return file;
  }

  function events() {
    return {
      allowAnyHost: false,
      log: vi.fn<(text: string) => void>(),
      onErrors: vi.fn<() => void>(),
      onMessage: vi.fn<(message: ChannelMessage, root: string) => void>(),
      onPages: vi.fn<(count: number) => void>(),
      onExit: vi.fn<() => void>(),
    };
  }

  it('runs in the project, and reports pages until stopped', async () => {
    const options = events();
    const server = await runSeminarDev(
      await cli(`process.send({ type: 'pages', count: 2 });
process.send({
  type: 'ready',
  url: 'http://127.0.0.1:1234/',
  root: process.cwd() + '|' + process.argv.slice(2).join(' '),
});
setInterval(() => undefined, 1000);`),
      project,
      { ...options, allowAnyHost: true },
    );
    expect(server.url).toBe('http://127.0.0.1:1234/');
    expect(server.root).toMatch(/\|dev --allow-any-host$/);
    expect(options.onPages).toHaveBeenCalledWith(2);
    expect(options.onExit).not.toHaveBeenCalled();
    server.stop();
    await vi.waitFor(() => {
      expect(options.onExit).toHaveBeenCalledOnce();
    });
  });

  it('logs its output, and tells about errors', async () => {
    const options = events();
    const server = await runSeminarDev(
      await cli(`console.log('Serving');
process.send({ type: 'ready', url: 'http://127.0.0.1:1234/', root: '/' });
setTimeout(() => {
  console.error('Internal server error');
}, 100);
setInterval(() => undefined, 1000);`),
      project,
      options,
    );
    await vi.waitFor(() => {
      expect(options.onErrors).toHaveBeenCalled();
    });
    expect(options.log).toHaveBeenCalledWith('Serving\n');
    expect(options.log).toHaveBeenCalledWith('Internal server error\n');
    server.stop();
  });

  it('passes messages between the pages and the extension', async () => {
    const options = events();
    const server = await runSeminarDev(
      await cli(`process.send({ type: 'ready', url: 'http://127.0.0.1:1234/', root: '/' });
process.on('message', ({ message }) => {
  process.send({ type: 'channel', message: { ...message, event: 'echo' } });
});`),
      project,
      options,
    );
    server.send({ page: '/talk.html', event: 'goToSlide', data: 1 });
    await vi.waitFor(() => {
      expect(options.onMessage).toHaveBeenCalledWith(
        { page: '/talk.html', event: 'echo', data: 1 },
        '/',
      );
    });
    server.stop();
  });

  it('rejects with what it printed if it fails to start', async () => {
    await expect(
      runSeminarDev(
        await cli(`console.error('Unknown command "dev".');
process.exitCode = 1;`),
        project,
        events(),
      ),
    ).rejects.toThrow('Unknown command "dev".');
  });
});
