import { defaultClientConditions } from 'vite';
import { defineProject } from 'vitest/config';

export default defineProject({
  resolve: {
    // Use the TypeScript sources of workspace packages directly.
    conditions: ['@slider/source', ...defaultClientConditions],
  },
  test: {
    // The tests run Vite themselves.
    environment: 'node',
  },
});
