import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadDeckSetup, readDeckTheme } from './deckSetup.ts';
import type { ModuleImporter } from './themeConfig.ts';

describe('readDeckTheme', () => {
  it('reads the theme of the frontmatter', () => {
    expect(readDeckTheme('---\ntheme: ./theme.ts\n---\n\n# Deck')).toBe(
      './theme.ts',
    );
    expect(readDeckTheme('# Deck')).toBeUndefined();
    expect(readDeckTheme('---\ntitle: Deck\n---\n')).toBeUndefined();
  });
});

describe('loadDeckSetup', () => {
  let root: string;

  /** Creates a package in the project with `seminar` in its manifest. */
  async function createPackage(name: string, seminar: unknown): Promise<void> {
    const directory = path.join(root, 'node_modules', name);
    await mkdir(directory, { recursive: true });
    await writeFile(
      path.join(directory, 'package.json'),
      JSON.stringify({ name, exports: { '.': './index.js' }, seminar }),
    );
  }

  const plugin = (name: string) => ({ source: name, exportName: 'plugin' });

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'seminar-setup-'));
    await createPackage('base-plugin', {
      options: { demo: { from: 'base' } },
      mdx: { remarkPlugins: { before: [plugin('remark-before')] } },
    });
    await createPackage('other-plugin', {
      plugins: ['base-plugin'],
      mdx: {
        rehypePlugins: { after: [plugin('rehype-after')] },
        recmaPlugins: { before: [plugin('missing')] },
      },
    });
    await createPackage('theme-package', {
      plugins: ['other-plugin', 'base-plugin'],
    });
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const modules: Record<string, unknown> = {
    'remark-before': { plugin: () => undefined },
    'rehype-after': { plugin: () => undefined },
  };
  const importPlugin: ModuleImporter = (specifier) =>
    modules[specifier] === undefined
      ? Promise.reject(new Error(`Cannot find ${specifier}`))
      : Promise.resolve({
          module: modules[specifier] as Record<string, unknown>,
        });

  it('loads the plugins that configs refer to, before them, and once', async () => {
    const deckPath = path.join(root, 'talk.deck.mdx');
    const setup = await loadDeckSetup({
      theme: 'theme-package',
      pluginsImporter: deckPath,
      themeImporter: deckPath,
      importPlugin,
    });
    expect(setup.seminarConfigs.map(({ source }) => source)).toEqual([
      'base-plugin',
      'other-plugin',
      'theme-package',
    ]);
    expect(setup.mdxPlugins.remarkPlugins.before).toEqual([
      modules['remark-before'] &&
        (modules['remark-before'] as { plugin: unknown }).plugin,
    ]);
    expect(setup.mdxPlugins.rehypePlugins.after).toHaveLength(1);
    expect(setup.mdxPlugins.recmaPlugins.before).toEqual([]);
    expect(setup.warnings).toEqual([
      expect.stringContaining('Cannot load the plugin missing') as unknown,
    ]);
    expect(setup.dependencies).toEqual(
      expect.arrayContaining([
        path.join(root, 'node_modules', 'theme-package', 'package.json'),
        path.join(root, 'node_modules', 'base-plugin', 'package.json'),
      ]),
    );
  });

  it('loads the configs of the packages of Seminar without importing them', async () => {
    const importModule: ModuleImporter = (specifier) =>
      Promise.reject(new Error(`Imported ${specifier}`));
    const setup = await loadDeckSetup({
      plugins: [
        '@seminar/elements',
        '@seminar/plugin-mathjax',
        '@seminar/plugin-pele',
        '@seminar/plugin-shiki',
      ],
      theme: '@seminar/theme-default',
      pluginsImporter: import.meta.filename,
      themeImporter: import.meta.filename,
      importModule,
      // Plugins of unified are imported, but they export any plugin here.
      importPlugin: () =>
        Promise.resolve({
          module: new Proxy({}, { get: () => () => undefined }),
        }),
    });
    expect(setup.warnings).toEqual([]);
    expect(setup.seminarConfigs.map(({ source }) => source)).toContain(
      '@seminar/theme-default',
    );
  });

  it('reports plugins that cannot be found', async () => {
    const deckPath = path.join(root, 'talk.deck.mdx');
    const setup = await loadDeckSetup({
      plugins: ['no-such-plugin'],
      pluginsImporter: deckPath,
      themeImporter: deckPath,
      importPlugin,
    });
    expect(setup.seminarConfigs).toEqual([]);
    expect(setup.warnings).toEqual([
      expect.stringContaining(
        'Cannot load the config of no-such-plugin',
      ) as unknown,
    ]);
  });

  it('resolves aliases before package config lookup and compiler plugin imports', async () => {
    await createPackage('alias-package', {
      plugins: ['alias-base'],
      mdx: { remarkPlugins: { after: [plugin('alias-attacher')] } },
    });
    const aliases: Record<string, string> = {
      'alias-theme': 'alias-package',
      'alias-base': 'base-plugin',
      'alias-attacher': 'remark-before',
    };
    const deckPath = path.join(root, 'talk.deck.mdx');
    const setup = await loadDeckSetup({
      theme: 'alias-theme',
      pluginsImporter: deckPath,
      themeImporter: deckPath,
      resolveModule: (source) => aliases[source] ?? source,
      importPlugin,
    });
    expect(setup.warnings).toEqual([]);
    expect(setup.seminarConfigs.map(({ source }) => source)).toEqual([
      'alias-base',
      'alias-theme',
    ]);
    expect(setup.mdxPlugins.remarkPlugins.after).toEqual(
      setup.mdxPlugins.remarkPlugins.before,
    );
    expect(setup.dependencies).toContain(
      path.join(root, 'node_modules/alias-package/package.json'),
    );
  });
});
