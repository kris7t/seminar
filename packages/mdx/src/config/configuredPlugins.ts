import path from 'node:path';
import type { VFile } from 'vfile';

import { getSliderConfigs } from './remarkSliderConfig.ts';
import { importWithNode, type ModuleImporter } from './themeConfig.ts';

/** The stages of compiling decks that configs can add plugins to. */
export type MdxPluginStage = 'remarkPlugins' | 'rehypePlugins' | 'recmaPlugins';

export interface ConfiguredPluginsOptions {
  /**
   * Imports the plugins at compile time. Defaults to importing with Node,
   * which only supports JavaScript.
   */
  importModule?: ModuleImporter | undefined;
  /**
   * Called with the files that the compiled deck depends on, e.g., the
   * modules of plugins, which should be watched for changes.
   */
  onDependency?: ((deckPath: string, dependency: string) => void) | undefined;
}

interface DeclaredPlugin {
  source: string;
  exportName: string;
  /** Path that `source` is resolved from. */
  base: string;
}

type Transformer = (tree: unknown, file: VFile) => unknown;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Returns the plugins that the configs of the deck declare for `stage`. */
function declaredPlugins(stage: MdxPluginStage, file: VFile): DeclaredPlugin[] {
  return (getSliderConfigs(file) ?? []).flatMap(({ source, config, base }) => {
    const mdx = isRecord(config) ? config['mdx'] : undefined;
    const plugins = isRecord(mdx) ? mdx[stage] : undefined;
    if (plugins === undefined) {
      return [];
    }
    if (!Array.isArray(plugins)) {
      file.message(
        `Expected \`mdx.${stage}\` in the config of ${source} to be an array`,
      );
      return [];
    }
    return plugins.flatMap((plugin: unknown) => {
      if (
        !isRecord(plugin) ||
        typeof plugin['source'] !== 'string' ||
        plugin['source'] === '' ||
        typeof plugin['exportName'] !== 'string' ||
        plugin['exportName'] === ''
      ) {
        file.message(
          `Expected the plugins of \`mdx.${stage}\` in the config of ${source} to have nonempty \`source\` and \`exportName\` strings`,
        );
        return [];
      }
      return [
        { source: plugin['source'], exportName: plugin['exportName'], base },
      ];
    });
  });
}

function isNode(value: unknown): boolean {
  return isRecord(value) && typeof value['type'] === 'string';
}

/**
 * Runs the plugins that the configs of the plugins and the theme of a deck
 * declare for `stage`, in their `mdx` key (see `MdxPluginsConfig` in
 * `@slider/core`), in the order of the configs.
 *
 * The configs are only known while compiling each deck, so this imports the
 * plugins, and runs their transformers, for each deck. Decks without such
 * plugins are compiled synchronously, e.g., with `compileSync`.
 *
 * Must run after `remarkSliderConfig`, which loads the configs.
 */
export function configuredPlugins(
  stage: MdxPluginStage,
  {
    importModule = importWithNode,
    onDependency,
  }: ConfiguredPluginsOptions = {},
): (this: unknown) => (tree: unknown, file: VFile) => unknown {
  return function attacher(this: unknown) {
    // The transformers run with the processor of the deck, like their own.
    return (tree, file) => {
      const plugins = declaredPlugins(stage, file);
      if (plugins.length === 0) {
        return undefined;
      }
      const deckPath = file.path || path.resolve('deck.mdx');
      return (async () => {
        let current = tree;
        for (const { source, exportName, base } of plugins) {
          let plugin: unknown;
          try {
            const { module, dependencies = [] } = await importModule(
              source,
              base,
            );
            for (const dependency of dependencies) {
              onDependency?.(deckPath, dependency);
            }
            plugin = module[exportName];
          } catch (error) {
            file.message(`Cannot load the plugin ${source}: ${String(error)}`);
            continue;
          }
          if (typeof plugin !== 'function') {
            file.message(
              `Expected ${source} to export the plugin \`${exportName}\``,
            );
            continue;
          }
          const transformer: unknown = (
            plugin as (this: unknown) => unknown
          ).call(this);
          if (typeof transformer !== 'function') {
            continue;
          }
          const result = await (transformer as Transformer)(current, file);
          // Transformers may return a new tree.
          if (isNode(result)) {
            current = result;
          }
        }
        return current;
      })();
    };
  };
}
