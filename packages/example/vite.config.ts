import seminar from '@seminar/vite-plugin';
import react from '@vitejs/plugin-react';
import {
  defaultClientConditions,
  defaultServerConditions,
  defineConfig,
} from 'vite';

export default defineConfig({
  plugins: [
    seminar({
      plugins: [
        '@seminar/elements',
        '@seminar/plugin-mathjax',
        '@seminar/plugin-shiki',
      ],
    }),
    react(),
  ],
  resolve: {
    // Use the TypeScript sources of workspace packages directly.
    conditions: ['@seminar/source', ...defaultClientConditions],
  },
  ssr: {
    resolve: {
      conditions: ['@seminar/source', ...defaultServerConditions],
    },
  },
  build: {
    rolldownOptions: {
      // The page for `index.deck.mdx` is added by the Seminar plugin.
      input: { components: 'components.html' },
    },
  },
});
