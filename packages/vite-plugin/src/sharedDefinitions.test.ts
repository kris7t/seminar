import { fileURLToPath } from 'node:url';

import { build, type Rolldown } from 'vite';
import { expect, it } from 'vitest';

it('removes unused cache and resource definitions and their lazy imports', async () => {
  const entry = 'virtual:shared-definitions';
  const definitions = fileURLToPath(
    new URL('../../core/src/shared/definitions.ts', import.meta.url),
  );
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    plugins: [
      {
        name: 'shared-definitions-test',
        resolveId(id) {
          return id === entry ? id : undefined;
        },
        load(id) {
          if (id !== entry) return undefined;
          return `
          import { defineResource, defineCache } from ${JSON.stringify(definitions)};
          const engine = defineResource({ load: () => import('unused-wasm') });
          const cached = defineCache((args, { engine }) => engine.render(args), {
            resources: { engine },
          });
          export const kept = 42;
        `;
        },
      },
    ],
    build: {
      write: false,
      minify: false,
      rolldownOptions: {
        input: entry,
        preserveEntrySignatures: 'strict',
        external: ['unused-wasm'],
      },
    },
  });
  const output = (
    Array.isArray(result) ? result[0] : result
  ) as Rolldown.RolldownOutput;
  const code = output.output
    .map((file) => (file.type === 'chunk' ? file.code : ''))
    .join('');
  expect(code).toContain('42');
  expect(code).not.toContain('unused-wasm');
  expect(code).not.toContain('defineResource');
  expect(code).not.toContain('defineCache');
});

it('removes unused store definitions', async () => {
  const entry = 'virtual:store-definitions';
  const definitions = fileURLToPath(
    new URL('../../core/src/state/defineStore.ts', import.meta.url),
  );
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    plugins: [
      {
        name: 'store-definitions-test',
        resolveId(id) {
          return id === entry ? id : undefined;
        },
        load(id) {
          if (id !== entry) return undefined;
          return `
          import { defineStore } from ${JSON.stringify(definitions)};
          const slide = defineStore({ initial: () => 'unused-slide' });
          const deck = defineStore({ scope: 'deck', initial: () => 'unused-deck' });
          export const kept = 42;
        `;
        },
      },
    ],
    build: {
      write: false,
      minify: false,
      rolldownOptions: { input: entry, preserveEntrySignatures: 'strict' },
    },
  });
  const output = (
    Array.isArray(result) ? result[0] : result
  ) as Rolldown.RolldownOutput;
  const code = output.output
    .map((file) => (file.type === 'chunk' ? file.code : ''))
    .join('');
  expect(code).toContain('42');
  expect(code).not.toContain('unused-slide');
  expect(code).not.toContain('unused-deck');
});
