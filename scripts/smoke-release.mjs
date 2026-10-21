import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { artifacts, checkRelease, root, verifyArtifact } from './release.mjs';

const packages = checkRelease();
const packed = JSON.parse(
  readFileSync(path.join(artifacts, 'manifest.json'), 'utf8'),
);
const lock = JSON.parse(
  readFileSync(path.join(root, 'package-lock.json'), 'utf8'),
);
const directory = mkdtempSync(path.join(os.tmpdir(), 'seminar-release-'));
const write = (name, content) =>
  writeFileSync(path.join(directory, name), content);
let passed = false;
try {
  const dependencies = Object.fromEntries(
    packages.map((pkg) => {
      const item = packed.find(
        (entry) => entry.name === pkg.name && entry.version === pkg.version,
      );
      if (item === undefined)
        throw new Error(`Pack ${pkg.name} before running the smoke test`);
      return [pkg.name, `file:${verifyArtifact(item)}`];
    }),
  );
  const devDependencies = Object.fromEntries(
    [
      'typescript',
      'vite',
      '@vitejs/plugin-react',
      'react',
      'react-dom',
      '@types/react',
      '@types/react-dom',
      '@types/node',
    ].map((name) => [name, lock.packages[`node_modules/${name}`].version]),
  );
  write(
    'package.json',
    JSON.stringify(
      {
        name: 'seminar-release-smoke',
        private: true,
        type: 'module',
        dependencies,
        devDependencies,
      },
      null,
      2,
    ),
  );
  execFileSync(
    'npm',
    ['install', '--ignore-scripts', '--no-audit', '--no-fund'],
    { cwd: directory, stdio: 'inherit' },
  );
  write(
    'tsconfig.json',
    JSON.stringify(
      {
        compilerOptions: {
          target: 'es2024',
          module: 'nodenext',
          moduleResolution: 'nodenext',
          jsx: 'react-jsx',
          strict: true,
          noEmit: true,
          skipLibCheck: false,
          resolveJsonModule: true,
          types: ['node', '@seminar/mdx/client'],
        },
        include: ['*.ts', '*.tsx'],
      },
      null,
      2,
    ),
  );
  write(
    'vite.config.ts',
    `import seminar, { type SeminarPluginOptions } from '@seminar/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
const options = { plugins: ['@seminar/elements', '@seminar/plugin-mathjax', '@seminar/plugin-shiki'] } satisfies SeminarPluginOptions;
export default defineConfig({ plugins: [seminar(options), react()] });
`,
  );
  write(
    'Probe.tsx',
    `import { useDeckState, useSlideState, useSlideView, HUNGARIAN } from '@seminar/core';
import { DynamicFormula } from '@seminar/plugin-mathjax/dynamic';
import type { DeckMdxOptions } from '@seminar/mdx';
import type { SeminarPluginOptions } from '@seminar/rollup-plugin';
import theme from '@seminar/theme-default';
import catalog from '@seminar/core/locales/hu.json' with { type: 'json' };
export const options: DeckMdxOptions = {};
export const rollupOptions: SeminarPluginOptions = {};
export default function Probe() {
  const [count, setCount] = useSlideState(0);
  const [value] = useDeckState<string>('value');
  const view = useSlideView();
  return <button style={{ color: theme.palette.text.primary }} onClick={() => setCount(count + 1)} title={catalog.resetDeck + HUNGARIAN.lang + String(view.mirrorPointer) + (value ?? '')}><DynamicFormula tex={String(count)} /></button>;
}
`,
  );
  write(
    'index.deck.mdx',
    `import Probe from './Probe.tsx';

# Release smoke

### Packed packages

The identity $x^2 + y^2 = z^2$ is typeset at build time.

:::columns
::column[One]

::column[Two]
:::

\`\`\`ts
const answer = 42;
\`\`\`

<Probe />
`,
  );
  write(
    'deck-types.ts',
    `import Deck from './index.deck.mdx';
export const deck = Deck;
`,
  );
  execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `for (const name of ['@seminar/core', '@seminar/elements', '@seminar/mdx', '@seminar/rollup-plugin', '@seminar/vite-plugin', '@seminar/plugin-mathjax/compile', '@seminar/plugin-mathjax/render', '@seminar/plugin-shiki/rehype']) await import(name);`,
    ],
    { cwd: directory, stdio: 'inherit' },
  );
  execFileSync(
    process.execPath,
    [path.join(directory, 'node_modules/typescript/bin/tsc')],
    { cwd: directory, stdio: 'inherit' },
  );
  execFileSync(
    process.execPath,
    [path.join(directory, 'node_modules/vite/bin/vite.js'), 'build'],
    { cwd: directory, stdio: 'inherit' },
  );
  const html = readFileSync(path.join(directory, 'dist/index.html'), 'utf8');
  assert.ok(
    html.includes('Release smoke'),
    'The packed plugins must build the deck',
  );
  assert.ok(
    !/<script[^>]*\bsrc=/.test(html),
    'The deck must contain its own scripts',
  );
  passed = true;
  console.log(
    'Packed packages pass Node imports, TypeScript checking, and a self-contained Vite build.',
  );
} finally {
  if (passed) rmSync(directory, { recursive: true, force: true });
  else console.error(`Release smoke fixture kept at ${directory}`);
}
