import { compile } from '@mdx-js/mdx';
import type { Element, Root } from 'hast';
import { describe, expect, it } from 'vitest';
import type { VFile } from 'vfile';

import { sliderMdxOptions } from '../options.ts';
import { STUB_URL } from '../test/compileDeck.ts';
import { getSliderOptions } from './sliderOptions.ts';
import type { ModuleImporter } from './themeConfig.ts';

function isElement(node: unknown): node is Element {
  return (
    typeof node === 'object' &&
    node !== null &&
    (node as { type?: unknown }).type === 'element'
  );
}

/** Marks the code blocks of a deck with the merged `marker` options. */
function rehypeMark() {
  return (tree: Root, file: VFile) => {
    const { label } = getSliderOptions(file, 'marker');
    const visit = (node: { children?: unknown[] }) => {
      for (const child of node.children ?? []) {
        if (isElement(child) && child.tagName === 'pre') {
          child.properties['dataMarker'] = String(label);
        }
        visit(child as { children?: unknown[] });
      }
    };
    visit(tree);
  };
}

async function compileWith(
  source: string,
  configs: { source: string; config: unknown }[],
  modules: Record<string, unknown>,
): Promise<VFile> {
  const importModule: ModuleImporter = (specifier) => {
    const module = modules[specifier];
    return module === undefined
      ? Promise.reject(new Error(`Cannot find ${specifier}`))
      : Promise.resolve({ module: module as Record<string, unknown> });
  };
  return compile(source, {
    ...sliderMdxOptions({
      importSource: STUB_URL,
      importModule,
      sliderConfigs: configs.map((entry) => ({ ...entry, base: entry.source })),
    }),
  });
}

const PLUGIN = {
  mdx: { rehypePlugins: [{ source: 'mark', exportName: 'rehypeMark' }] },
};

describe('configuredPlugins', () => {
  it('runs the plugins of the configs with merged options', async () => {
    const file = await compileWith(
      '---\nmarker:\n  label: deck\n---\n\n```ts\nx\n```',
      [
        {
          source: 'plugin',
          config: { ...PLUGIN, options: { marker: { label: 'plugin' } } },
        },
        {
          source: 'theme',
          config: { options: { marker: { label: 'theme' } } },
        },
      ],
      { mark: { rehypeMark } },
    );
    expect(String(file)).toContain('"data-marker": "deck"');
  });

  it('takes the options of later configs', async () => {
    const file = await compileWith(
      '```ts\nx\n```',
      [
        {
          source: 'plugin',
          config: { ...PLUGIN, options: { marker: { label: 'plugin' } } },
        },
        {
          source: 'theme',
          config: { options: { marker: { label: 'theme' } } },
        },
      ],
      { mark: { rehypeMark } },
    );
    expect(String(file)).toContain('"data-marker": "theme"');
  });

  it('reports plugins that cannot be loaded, and compiles anyway', async () => {
    const file = await compileWith(
      '```ts\nx\n```',
      [{ source: 'plugin', config: PLUGIN }],
      {},
    );
    expect(file.messages.map(({ reason }) => reason)).toEqual([
      expect.stringContaining('Cannot load the plugin mark') as unknown,
    ]);
    expect(String(file)).not.toContain('data-marker');
  });

  it('compiles synchronously without plugins', async () => {
    const { compileSync } = await import('@mdx-js/mdx');
    expect(() =>
      compileSync(
        '```ts\nx\n```',
        sliderMdxOptions({ importSource: STUB_URL, math: false }),
      ),
    ).not.toThrow();
  });
});
