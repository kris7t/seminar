import { defaultClientConditions } from 'vite';
import { defineProject } from 'vitest/config';

import slider from './src/index.ts';

export default defineProject({
  plugins: [slider()],
  resolve: {
    // Use the TypeScript sources of workspace packages directly.
    conditions: ['@slider/source', ...defaultClientConditions],
  },
  test: {
    environment: 'jsdom',
    // The cache doesn't notice changes to the plugin, so the tests would see
    // stale compiled fixtures.
    fsModuleCache: false,
    setupFiles: ['../core/vitest.setup.ts'],
  },
});
