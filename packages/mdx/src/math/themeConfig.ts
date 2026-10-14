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

/** The compile-time config of a theme, as written by the theme. */
export interface LoadedThemeConfig {
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
 * Loads the compile-time config of the theme `theme` imported by the deck at
 * `deckPath`. Theme packages may provide it as
 *
 * 1. a JSON file with the `slider` export condition, e.g.,
 *    `"exports": { ".": { "slider": "./slider.json", "default": … } }`,
 *    which allows packages with several themes to configure each of them, or
 * 2. the `slider` key of their `package.json`, which is simpler for packages
 *    with a single theme.
 *
 * Otherwise, e.g., for themes in local files, the theme module is imported
 * with `importModule` and the config is its `slider` export. This runs the
 * theme module at compile time, so it shouldn't access browser globals at the
 * top level.
 */
export async function loadThemeConfig(
  theme: string,
  deckPath: string,
  importModule: ModuleImporter,
): Promise<LoadedThemeConfig> {
  const installed = isBareSpecifier(theme)
    ? readPackage(theme, deckPath)
    : undefined;
  if (installed !== undefined) {
    const configPath = resolveExport(theme, installed, {
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
  const { module, dependencies = [] } = await importModule(theme, deckPath);
  return {
    config: module['slider'],
    base: installed?.directory ?? path.resolve(path.dirname(deckPath), theme),
    dependencies,
  };
}
