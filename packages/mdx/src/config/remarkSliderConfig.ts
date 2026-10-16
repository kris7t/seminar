import path from 'node:path';

import type { VFile } from 'vfile';

import {
  importWithNode,
  loadSliderConfig,
  type ModuleImporter,
} from '../math/themeConfig.ts';

export interface RemarkSliderConfigOptions {
  /** Configs loaded by the MDX integration, in increasing precedence. */
  configs?: readonly LoadedSliderConfigEntry[] | undefined;
  /** Imports local plugin and theme modules at compile time. */
  importModule?: ModuleImporter | undefined;
  /** Called for every file read to load a plugin or theme config. */
  onDependency?: ((deckPath: string, dependency: string) => void) | undefined;
}

/** A config loaded for the deck, in increasing order of precedence. */
export interface LoadedSliderConfigEntry {
  source: string;
  config: unknown;
  base: string;
}

interface SliderFileData {
  sliderFrontmatter?: Record<string, unknown> | undefined;
  sliderConfigs?: LoadedSliderConfigEntry[] | undefined;
}

/** Returns configs loaded for the deck, in increasing order of precedence. */
export function getSliderConfigs(
  file: VFile,
): readonly LoadedSliderConfigEntry[] | undefined {
  return (file.data as SliderFileData).sliderConfigs;
}

async function loadConfig(
  source: string,
  deckPath: string,
  importModule: ModuleImporter,
  onDependency: RemarkSliderConfigOptions['onDependency'],
  file: VFile,
): Promise<LoadedSliderConfigEntry | undefined> {
  try {
    const loaded = await loadSliderConfig(source, deckPath, importModule);
    for (const dependency of loaded.dependencies) {
      onDependency?.(deckPath, dependency);
    }
    return { source, config: loaded.config, base: loaded.base };
  } catch (error) {
    file.message(
      `Cannot load the config of the theme ${source}: ${String(error)}`,
    );
    return undefined;
  }
}

/**
 * Adds the compile-time config of the deck's theme to configs already loaded
 * by the MDX integration. The theme is last, so consumers can let it override
 * plugin options.
 *
 * Must run after `remarkSlides`, which stores the deck's frontmatter.
 */
export function remarkSliderConfig({
  configs = [],
  importModule = importWithNode,
  onDependency,
}: RemarkSliderConfigOptions = {}): (
  tree: unknown,
  file: VFile,
) => void | Promise<void> {
  return (_tree, file) => {
    const data = file.data as SliderFileData;
    const theme = data.sliderFrontmatter?.['theme'];
    if (typeof theme !== 'string') {
      data.sliderConfigs = [...configs];
      return;
    }
    const deckPath = file.path || path.resolve('deck.mdx');
    return (async () => {
      const entries: LoadedSliderConfigEntry[] = [...configs];
      if (typeof theme === 'string') {
        const entry = await loadConfig(
          theme,
          deckPath,
          importModule,
          onDependency,
          file,
        );
        if (entry !== undefined) {
          entries.push(entry);
        }
      }
      data.sliderConfigs = entries;
    })();
  };
}
