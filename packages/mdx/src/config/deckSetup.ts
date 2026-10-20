import path from 'node:path';

import type { Pluggable } from 'unified';
import { parse as parseYaml } from 'yaml';

import type { LoadedSeminarConfigEntry } from './remarkSeminarConfig.ts';
import {
  importWithNode,
  loadSeminarConfig,
  type ModuleImporter,
} from './themeConfig.ts';

/** The stages of compiling decks that configs can add plugins to. */
export type MdxPluginStage = 'remarkPlugins' | 'rehypePlugins' | 'recmaPlugins';

const STAGES: readonly MdxPluginStage[] = [
  'remarkPlugins',
  'rehypePlugins',
  'recmaPlugins',
];

/** Plugins of a stage, which run before or after those of Seminar. */
export interface StagePlugins {
  before: Pluggable[];
  after: Pluggable[];
}

/** The plugins that the configs of a deck add to each stage. */
export type MdxPlugins = Record<MdxPluginStage, StagePlugins>;

/** Everything that compiling a deck needs from its configs. */
export interface DeckSetup {
  /** The configs of the plugins and the theme, in increasing precedence. */
  seminarConfigs: LoadedSeminarConfigEntry[];
  /** The plugins of unified that the configs add. */
  mdxPlugins: MdxPlugins;
  /** Files that the setup was loaded from, to watch for changes. */
  dependencies: string[];
  /** Problems with the configs, e.g., plugins that can't be loaded. */
  warnings: string[];
}

export interface DeckSetupOptions {
  /** Plugins of the integration, e.g., `['@seminar/elements']`. */
  plugins?: readonly string[] | undefined;
  /** The theme of the deck, if any, as written in the frontmatter. */
  theme?: string | undefined;
  /** Path to resolve `plugins` from, e.g., a file in the project root. */
  pluginsImporter: string;
  /** Path to resolve `theme` from, i.e., the deck. */
  themeImporter: string;
  /**
   * Imports the modules of configs at compile time, e.g., themes written in
   * TypeScript. Defaults to importing with Node.
   */
  importModule?: ModuleImporter | undefined;
  /**
   * Imports the plugins of unified that configs add. Defaults to importing
   * with Node, since the plugins run long after they're imported, e.g., to
   * load more modules, so they must be built to JavaScript.
   */
  importPlugin?: ModuleImporter | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Creates a setup without configs, e.g., for compiling decks in tests. */
export function emptyMdxPlugins(): MdxPlugins {
  return {
    remarkPlugins: { before: [], after: [] },
    rehypePlugins: { before: [], after: [] },
    recmaPlugins: { before: [], after: [] },
  };
}

/**
 * Reads the `theme` of a deck from the frontmatter of its source, without
 * parsing the rest of it, which may need the plugins of the theme.
 */
export function readDeckTheme(source: string): string | undefined {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?(?:\n|$)/.exec(source);
  if (match?.[1] === undefined) {
    return undefined;
  }
  try {
    const frontmatter: unknown = parseYaml(match[1]);
    const theme = isRecord(frontmatter) ? frontmatter['theme'] : undefined;
    return typeof theme === 'string' && theme !== '' ? theme : undefined;
  } catch {
    // Compiling the deck reports the error.
    return undefined;
  }
}

/**
 * Loads the configs of the plugins of the integration and of the theme of a
 * deck, and the plugins that they refer to, in their `plugins` key, before
 * them. Then imports the plugins of unified that they add (see
 * `SeminarConfig` in `@seminar/core`).
 *
 * Each config is loaded once, even if several others refer to it.
 */
export async function loadDeckSetup({
  plugins = [],
  theme,
  pluginsImporter,
  themeImporter,
  importModule = importWithNode,
  importPlugin = importWithNode,
}: DeckSetupOptions): Promise<DeckSetup> {
  const setup: DeckSetup = {
    seminarConfigs: [],
    mdxPlugins: emptyMdxPlugins(),
    dependencies: [],
    warnings: [],
  };
  const seen = new Set<string>();
  const visit = async (source: string, importer: string): Promise<void> => {
    let loaded;
    try {
      loaded = await loadSeminarConfig(source, importer, importModule);
    } catch (error) {
      setup.warnings.push(
        `Cannot load the config of ${source}: ${String(error)}`,
      );
      return;
    }
    if (seen.has(loaded.base)) {
      return;
    }
    seen.add(loaded.base);
    setup.dependencies.push(...loaded.dependencies);
    const { config } = loaded;
    const references = isRecord(config) ? config['plugins'] : undefined;
    if (Array.isArray(references)) {
      for (const reference of references as unknown[]) {
        if (typeof reference === 'string' && reference !== '') {
          await visit(reference, loaded.base);
        } else {
          setup.warnings.push(
            `Expected the \`plugins\` of ${source} to be names of plugins`,
          );
        }
      }
    } else if (references !== undefined) {
      setup.warnings.push(`Expected \`plugins\` of ${source} to be an array`);
    }
    setup.seminarConfigs.push({ source, config, base: loaded.base });
  };
  for (const plugin of plugins) {
    await visit(plugin, pluginsImporter);
  }
  if (theme !== undefined) {
    await visit(theme, themeImporter);
  }
  for (const entry of setup.seminarConfigs) {
    await importMdxPlugins(entry, setup, importPlugin);
  }
  return setup;
}

/** Imports the plugins of unified that the config of `entry` adds. */
async function importMdxPlugins(
  { source, config, base }: LoadedSeminarConfigEntry,
  setup: DeckSetup,
  importModule: ModuleImporter,
): Promise<void> {
  const mdx = isRecord(config) ? config['mdx'] : undefined;
  if (mdx === undefined) {
    return;
  }
  if (!isRecord(mdx)) {
    setup.warnings.push(`Expected \`mdx\` of ${source} to be an object`);
    return;
  }
  for (const stage of STAGES) {
    const stagePlugins = mdx[stage];
    if (stagePlugins === undefined) {
      continue;
    }
    if (!isRecord(stagePlugins)) {
      setup.warnings.push(
        `Expected \`mdx.${stage}\` of ${source} to be an object with \`before\` and \`after\``,
      );
      continue;
    }
    for (const place of ['before', 'after'] as const) {
      const declared = stagePlugins[place];
      if (declared === undefined) {
        continue;
      }
      if (!Array.isArray(declared)) {
        setup.warnings.push(
          `Expected \`mdx.${stage}.${place}\` of ${source} to be an array`,
        );
        continue;
      }
      for (const plugin of declared as unknown[]) {
        const attacher = await importPlugin(
          plugin,
          source,
          base,
          setup,
          importModule,
        );
        if (attacher !== undefined) {
          setup.mdxPlugins[stage][place].push(attacher);
        }
      }
    }
  }
}

async function importPlugin(
  plugin: unknown,
  configSource: string,
  base: string,
  setup: DeckSetup,
  importModule: ModuleImporter,
): Promise<Pluggable | undefined> {
  if (
    !isRecord(plugin) ||
    typeof plugin['source'] !== 'string' ||
    plugin['source'] === '' ||
    typeof plugin['exportName'] !== 'string' ||
    plugin['exportName'] === ''
  ) {
    setup.warnings.push(
      `Expected the plugins of \`mdx\` of ${configSource} to have nonempty \`source\` and \`exportName\` strings`,
    );
    return undefined;
  }
  const { source, exportName } = plugin;
  try {
    const { module, dependencies = [] } = await importModule(source, base);
    setup.dependencies.push(...dependencies);
    const attacher = module[exportName];
    if (typeof attacher !== 'function') {
      setup.warnings.push(
        `Expected ${source} to export the plugin \`${exportName}\``,
      );
      return undefined;
    }
    return attacher as Pluggable;
  } catch (error) {
    setup.warnings.push(`Cannot load the plugin ${source}: ${String(error)}`);
    return undefined;
  }
}

/** Returns the path that the theme of a deck at `deckPath` resolves to. */
export function resolveThemeKey(theme: string, deckPath: string): string {
  return theme.startsWith('.')
    ? path.resolve(path.dirname(deckPath), theme)
    : theme;
}
