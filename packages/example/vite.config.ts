import slider from '@slider/vite-plugin';
import react from '@vitejs/plugin-react';
import { defaultClientConditions, defineConfig } from 'vite';

export default defineConfig({
  plugins: [slider({ plugins: ['@slider/elements'] }), react()],
  resolve: {
    // Use the TypeScript sources of workspace packages directly.
    conditions: ['@slider/source', ...defaultClientConditions],
  },
  build: {
    rolldownOptions: {
      // The page for `index.deck.mdx` is added by the slider plugin.
      input: { components: 'components.html' },
    },
  },
});
