import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    // Tests that go through many menus are slow if the machine is busy.
    testTimeout: 20000,
  },
});
