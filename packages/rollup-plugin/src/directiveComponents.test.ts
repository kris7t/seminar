import path from 'node:path';

import type { ModuleImporter } from '@seminar/mdx';
import { describe, expect, it } from 'vitest';

import seminar from './index.ts';

const root = path.resolve('/project');

/** Imports the configs of `modules` by their paths, without running code. */
function importConfigs(modules: Record<string, unknown>): ModuleImporter {
  return (specifier, importer) => {
    const file = path.resolve(path.dirname(importer), specifier);
    if (!(file in modules)) {
      return Promise.reject(new Error(`Cannot find ${file}`));
    }
    return Promise.resolve({
      module: { seminar: modules[file] },
      dependencies: [file],
    });
  };
}

function setUp(modules: Record<string, unknown>, plugins = ['./plugin.ts']) {
  const plugin = seminar({
    defaultTheme: false,
    plugins,
    directives: { aside: { source: 'asides', exportName: 'Aside' } },
    importModule: importConfigs(modules),
  });
  plugin.config({ root }, { mode: 'development' });
  return plugin;
}

describe('directiveComponents', () => {
  it('collects the directives of the plugins and the theme', async () => {
    const plugin = setUp({
      [path.join(root, 'plugin.ts')]: {
        directives: {
          note: { source: 'notes', exportName: 'Note' },
          box: { source: 'boxes', exportName: 'Box', wrapIn: 'boxes' },
        },
      },
      [path.join(root, 'decks/theme.tsx')]: {
        directives: { note: { source: './Note.tsx', exportName: 'ThemeNote' } },
      },
    });
    const deck = path.join(root, 'decks/talk.deck.mdx');
    expect(
      await plugin.directiveComponents(
        '---\ntheme: ./theme.tsx\n---\n\n# Talk',
        deck,
      ),
    ).toEqual({
      directives: {
        aside: { source: 'asides', exportName: 'Aside' },
        note: { source: './Note.tsx', exportName: 'ThemeNote' },
        box: { source: 'boxes', exportName: 'Box', wrapIn: 'boxes' },
      },
      dependencies: [
        path.join(root, 'plugin.ts'),
        path.join(root, 'decks/theme.tsx'),
      ],
      warnings: [
        'The `box` directive is wrapped in the `boxes` directive, which has no component',
      ],
    });
  });

  it('tells which configs cannot be loaded', async () => {
    const plugin = setUp({}, ['./missing.ts']);
    const { directives, warnings } = await plugin.directiveComponents(
      '# Talk',
      path.join(root, 'talk.deck.mdx'),
    );
    expect(directives).toEqual({
      aside: { source: 'asides', exportName: 'Aside' },
    });
    expect(warnings).toEqual([
      expect.stringContaining('Cannot load the config of ./missing.ts'),
    ]);
  });

  it('compiles decks with the directives of the options', async () => {
    const plugin = setUp({ [path.join(root, 'plugin.ts')]: {} });
    const result = await plugin.transform.call(
      {
        addWatchFile() {
          // Nothing to watch.
        },
        warn() {
          // Not tested here.
        },
      },
      '# Talk\n\n::aside[Text]',
      path.join(root, 'talk.deck.mdx'),
    );
    expect(JSON.stringify(result)).toContain('Aside');
  });
});
