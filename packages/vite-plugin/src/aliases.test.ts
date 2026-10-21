import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { build, createServer, type Alias, type Rolldown } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import seminar from './index.ts';
import { createViteImporter } from './importModule.ts';

let root: string;
const write = (name: string, contents: string) =>
  writeFile(path.join(root, name), contents);
beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'seminar-aliases-'));
  await symlink(
    fileURLToPath(new URL('../../../node_modules', import.meta.url)),
    path.join(root, 'node_modules'),
    'dir',
  );
  await mkdir(path.join(root, 'src'));
  await write('package.json', '{"type":"module"}');
  await write(
    'index.deck.mdx',
    '# Original title\n\n### Math\n\n$\\R$ and $\\Q$',
  );
  await write('src/palette.ts', "export const primary = '#123456';\n");
  await write('src/styles.css', 'body { color: red; }');
  await write(
    'src/theme.ts',
    `import '@/styles.css';
import { primary } from '@/palette';
import { createSlideTheme } from '@seminar/core';
export default createSlideTheme({ palette: { primary: { main: primary } } });
export const seminar = { plugins: ['./relative-plugin.ts', 'local-plugin'], options: { math: { macros: { R: '\\\\mathbb{R}' } } } };
`,
  );
  await write(
    'src/relative-plugin.ts',
    "export const seminar = { options: { math: { macros: { Q: '\\\\mathbb{Q}' } } } };",
  );
  await write(
    'src/plugin.ts',
    `export const seminar = {
  plugins: ['math'],
  mdx: { remarkPlugins: { before: [{ source: 'compiler', exportName: 'plugin' }] } }
};`,
  );
  await write(
    'src/compiler.mjs',
    `export function plugin() {
  return async function(tree) {
    const { title } = await import('./title.mjs');
    const heading = tree.children.find(node => node.type === 'heading');
    heading.children = [{ type: 'text', value: title }];
  };
}`,
  );
  await write(
    'src/title.mjs',
    "export const title = 'Aliased compiler plugin';",
  );
  await write(
    'src/override.ts',
    `export { default } from '@/theme';
export const seminar = { options: { math: { font: 'newcm' } } };`,
  );
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

function aliases(): Alias[] {
  return [
    { find: '@', replacement: path.join(root, 'src') },
    { find: 'local-plugin', replacement: path.join(root, 'src/plugin.ts') },
    { find: /^compiler$/, replacement: path.join(root, 'src/compiler.mjs') },
    { find: 'math', replacement: '@seminar/plugin-mathjax' },
  ];
}

describe('Vite aliases', () => {
  it('caches extensionless theme entries and tracks changes in aliased dependencies', async () => {
    const importer = createViteImporter(() => ({ root, alias: aliases() }));
    const entry = path.join(root, 'src/theme');
    const deck = path.join(root, 'index.deck.mdx');
    const first = await importer(entry, deck);
    expect(first.base).toBe(path.join(root, 'src/theme.ts'));
    expect(first.dependencies).toEqual(
      expect.arrayContaining([
        path.join(root, 'src/theme.ts'),
        path.join(root, 'src/palette.ts'),
      ]),
    );
    expect(await importer(entry, deck)).toBe(first);
    try {
      await write('src/palette.ts', "export const primary = '#654321';");
      const updated = await importer(entry, deck);
      expect(updated).not.toBe(first);
      expect(updated.module['default']).toMatchObject({
        palette: { primary: { main: '#654321' } },
      });
    } finally {
      await write('src/palette.ts', "export const primary = '#123456';");
    }
  });
  it('resolves a default theme, nested config imports, plugin configs, and compiler plugins in builds', async () => {
    const warnings: string[] = [];
    const result = await build({
      root,
      configFile: false,
      logLevel: 'silent',
      plugins: [
        seminar({ defaultTheme: '@/theme', selfContained: false }),
        react(),
      ],
      resolve: { alias: aliases() },
      build: {
        write: false,
        minify: false,
        rolldownOptions: {
          onwarn: (warning) => warnings.push(warning.message),
        },
      },
    });
    const output = (
      Array.isArray(result) ? result[0] : result
    ) as Rolldown.RolldownOutput;
    const code = output.output
      .map((file) => (file.type === 'chunk' ? file.code : ''))
      .join('');
    expect(code).toContain('Aliased compiler plugin');
    expect(code).toMatch(/MJX-\d+-STX-/);
    expect(code).toContain('#123456');
    expect(
      warnings.filter((message) =>
        /Cannot load|Undefined control/.test(message),
      ),
    ).toEqual([]);
  }, 60_000);

  it('uses aliases for frontmatter themes and watches aliased dependencies during development', async () => {
    const server = await createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      plugins: [
        seminar({ defaultTheme: '@/theme', plugins: ['math'] }),
        react(),
      ],
      resolve: { alias: aliases() },
      server: { middlewareMode: true },
    });
    try {
      const first = await server.transformRequest('/index.deck.mdx');
      expect(first?.code).toContain('Aliased compiler plugin');
      expect(first?.code).toMatch(/MJX-\d+-STX-/);
      await write(
        'override.deck.mdx',
        '---\ntheme: "@/override"\n---\n\n# Override\n\n$x$',
      );
      const overridden = await server.transformRequest('/override.deck.mdx');
      expect(overridden?.code).toMatch(/MJX-\d+-NCM-/);
      const graph = server.environments.client.moduleGraph;
      const theme = graph.getModuleById(path.join(root, 'src/theme.ts'));
      expect(theme).toBeDefined();
      const importer = [...(theme?.importers ?? [])].find((module) =>
        module.file?.endsWith('index.deck.mdx'),
      );
      expect(importer).toBeDefined();
      const configFile = path.join(root, 'src/relative-plugin.ts');
      await write(
        'src/relative-plugin.ts',
        "export const seminar = { options: { math: { macros: { Q: 'z' } } } };",
      );
      await server.environments.client.pluginContainer.watchChange(configFile, {
        event: 'update',
      });
      graph.invalidateAll();
      const refreshed = await server.transformRequest('/index.deck.mdx');
      expect(refreshed?.code).toContain('>z</mi>');
    } finally {
      await server.close();
    }
  }, 60_000);
});
