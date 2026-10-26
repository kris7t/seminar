import { defineProject } from 'vitest/config';

export default defineProject({
  resolve: { conditions: ['@seminar/source'] },
  test: {
    environment: 'jsdom',
    setupFiles: ['../core/vitest.setup.ts'],
  },
});
