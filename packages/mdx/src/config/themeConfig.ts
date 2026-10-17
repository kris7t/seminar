import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { isBareSpecifier, readPackage, resolveExport } from './packages.ts';

/**
 * The export condition of the compile-time config of theme packages, which is
 * also the key of the config in `package.json` and the name of its export in
 * theme modules.
 */
export const CONFIG_CONDITION = 'slider';

/** A module imported at compile time. */
export interface ImportedModule {
  /** The exports of the module. */
  module: Record<string, unknown>;
  /** Files the module was loaded from, which should be watched for changes. */
  dependencies?: string[] | undefined;
}

/**
 * Imports the module `specifier` relative to the file `importer` at compile
 * time, e.g., with the module runner of Vite to support TypeScript.
 */
export type ModuleImporter = (
  specifier: string,
  importer: string,
) => Promise<ImportedModule>;

/** A compile-time Slider config loaded from a plugin or theme. */
export interface LoadedSliderConfig {
  config: unknown;
  /** Path to resolve packages needed by the config from, e.g., math fonts. */
  base: string;
  dependencies: string[];
}

/**
 * Imports modules with Node, which only supports JavaScript. Bare specifiers
 * are resolved from `importer`.
 */
export const importWithNode: ModuleImporter = async (specifier, importer) => {
  let resolved: string;
  if (isBareSpecifier(specifier)) {
    const installed = readPackage(specifier, importer);
    const target =
      installed === undefined
        ? undefined
        : resolveExport(specifier, installed, {
            conditions: ['node', 'import', 'default'],
            unsafe: true,
          });
    if (target === undefined) {
      throw new Error(`Cannot resolve ${specifier} from ${importer}`);
    }
    resolved = target;
  } else {
    resolved = path.resolve(path.dirname(importer), specifier);
  }
  const module = (await import(pathToFileURL(resolved).href)) as Record<
    string,
    unknown
  >;
  return { module, dependencies: [resolved] };
};

/**
 * Loads the compile-time config of the Slider plugin or theme `source` for the
 * deck at `deckPath`. Packages may provide it as
 *
 * 1. a JSON file with the `slider` export condition, e.g.,
 *    `"exports": { ".": { "slider": "./slider.json", "default": … } }`,
 *    which allows package subpaths to have different configs, or
 * 2. the `slider` key of their `package.json`, which is simpler for packages
 *    with a single config.
 *
 * Otherwise, e.g., for local files, the module is imported with
 * `importModule` and the config is its `slider` export. This runs the module
 * at compile time, so it shouldn't access browser globals at the top level.
 */
export async function loadSliderConfig(
  source: string,
  deckPath: string,
  importModule: ModuleImporter,
): Promise<LoadedSliderConfig> {
  const installed = isBareSpecifier(source)
    ? readPackage(source, deckPath)
    : undefined;
  if (installed !== undefined) {
    const configPath = resolveExport(source, installed, {
      conditions: [CONFIG_CONDITION],
      unsafe: true,
    });
    if (configPath?.endsWith('.json') === true) {
      return {
        config: JSON.parse(await readFile(configPath, 'utf8')),
        base: configPath,
        dependencies: [configPath],
      };
    }
    if (installed.manifest[CONFIG_CONDITION] !== undefined) {
      const manifestPath = path.join(installed.directory, 'package.json');
      return {
        config: installed.manifest[CONFIG_CONDITION],
        base: manifestPath,
        dependencies: [manifestPath],
      };
    }
  }
  const { module, dependencies = [] } = await importModule(source, deckPath);
  return {
    config: module['slider'],
    base: installed?.directory ?? path.resolve(path.dirname(deckPath), source),
    dependencies,
  };
}

/** Theme-specific name retained for compatibility. */
export function loadThemeConfig(
  theme: string,
  deckPath: string,
  importModule: ModuleImporter,
): Promise<LoadedSliderConfig> {
  return loadSliderConfig(theme, deckPath, importModule);
}

/** Theme-specific name retained for compatibility. */
export type LoadedThemeConfig = LoadedSliderConfig;
