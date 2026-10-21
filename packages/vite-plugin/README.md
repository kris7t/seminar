# @seminar/vite-plugin

Vite plugin for Seminar presentations.

Part of [Seminar](https://seminar.run), a toolkit for scientific talks and
lectures as Markdown presentations. Requires Node.js 24 or newer.

```ts
import seminar from '@seminar/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [seminar(), react()],
});
```

Each `.deck.mdx` file gets its own HTML page. Production builds are
self-contained by default.

[Documentation](https://seminar.run/guide/vite) ·
[Source](https://github.com/kris7t/seminar/tree/main/packages/vite-plugin)

Licensed under the Apache License 2.0.
