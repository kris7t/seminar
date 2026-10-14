import slider from '@slider/rollup-plugin';
import react from '@vitejs/plugin-react';
import { defaultClientConditions, defineConfig } from 'vite';

export default defineConfig({
  plugins: [slider(), react()],
  resolve: {
    // Use the TypeScript sources of workspace packages directly.
    conditions: ['@slider/source', ...defaultClientConditions],
  },
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        components: 'components.html',
      },
    },
  },
});
