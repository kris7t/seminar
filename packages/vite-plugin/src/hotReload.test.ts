import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { createServer, type InlineConfig } from 'vite';
import { describe, expect, it } from 'vitest';

import { seminarHotReload } from './hotReload.ts';

const root = fileURLToPath(new URL('test/fixtures', import.meta.url));

async function transformStores(config: InlineConfig): Promise<string> {
  const server = await createServer({
    configFile: false,
    logLevel: 'silent',
    root,
    appType: 'custom',
    optimizeDeps: { noDiscovery: true },
    ...config,
    server: { middlewareMode: true, ws: false, ...config.server },
  });
  try {
    const result = await server.transformRequest('/stores.tsx');
    return result?.code ?? '';
  } finally {
    await server.close();
  }
}

describe('seminarHotReload', () => {
  it('identifies the stores of modules with types and JSX', async () => {
    const code = await transformStores({
      plugins: [seminarHotReload(), react()],
    });
    expect(code).toContain('stores.tsx#count#1');
  });

  it('leaves stores alone without React Fast Refresh or hot updates', async () => {
    expect(
      await transformStores({ plugins: [seminarHotReload()] }),
    ).not.toContain('#count#1');
    expect(
      await transformStores({
        plugins: [seminarHotReload(), react()],
        server: { hmr: false },
      }),
    ).not.toContain('#count#1');
  });
});
