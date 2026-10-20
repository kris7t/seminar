import { defaultClientConditions } from 'vite';
import { defineProject } from 'vitest/config';

import seminar from './src/index.ts';

export default defineProject({
  plugins: [
    seminar({
      plugins: [
        './src/fixtures/plugin.ts',
        '@seminar/elements',
        '@seminar/plugin-mathjax',
      ],
    }),
  ],
  resolve: {
    // Use the TypeScript sources of workspace packages directly.
    conditions: ['@seminar/source', ...defaultClientConditions],
    dedupe: ['react', 'react-dom', '@emotion/react', '@emotion/styled'],
  },
  test: {
    environment: 'jsdom',
    // The cache doesn't notice changes to the plugin, so the tests would see
    // stale compiled fixtures.
    fsModuleCache: false,
    setupFiles: ['../core/vitest.setup.ts'],
  },
});
