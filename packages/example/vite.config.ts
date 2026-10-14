import react from '@vitejs/plugin-react';
import { defaultClientConditions, defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Use the TypeScript sources of workspace packages directly.
    conditions: ['@slider/source', ...defaultClientConditions],
  },
});
