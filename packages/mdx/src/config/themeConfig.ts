import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { isBareSpecifier, readPackage, resolveExport } from './packages.ts';

/**
 * The export condition of the compile-time config of theme packages, which is
 * also the key of the config in `package.json` and the name of its export in
 * theme modules.
 */
export const CONFIG_CONDITION = 'seminar';

/** A module imported at compile time. */
export interface ImportedModule {
  /** The exports of the module. */
  module: Record<string, unknown>;
  /** Files the module was loaded from, which should be watched for changes. */
  dependencies?: string[] | undefined;
  /** Resolved entry file to use as the base of relative config references. */
  base?: string | undefined;
}

/** Resolves integration-specific aliases before config lookup or imports. */
export type ModuleResolver = (
  specifier: string,
  importer: string,
) => string | Promise<string>;

/**
 * Imports the module `specifier` relative to the file `importer` at compile
 * time, e.g., with the module runner of Vite to support TypeScript.
 */
export type ModuleImporter = (
  specifier: string,
  importer: string,
) => Promise<ImportedModule>;

/** A compile-time Seminar config loaded from a plugin or theme. */
export interface LoadedSeminarConfig {
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
 * Loads the compile-time config of the Seminar plugin or theme `source` for the
 * deck at `deckPath`. Packages may provide it as
 *
 * 1. a JSON file with the `seminar` export condition, e.g.,
 *    `"exports": { ".": { "seminar": "./seminar.json", "default": … } }`,
 *    which allows package subpaths to have different configs, or
 * 2. the `seminar` key of their `package.json`, which is simpler for packages
 *    with a single config.
 *
 * Otherwise, e.g., for local files, the module is imported with
 * `importModule` and the config is its `seminar` export. This runs the module
 * at compile time, so it shouldn't access browser globals at the top level.
 */
export async function loadSeminarConfig(
  source: string,
  deckPath: string,
  importModule: ModuleImporter,
): Promise<LoadedSeminarConfig> {
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
  const {
    module,
    dependencies = [],
    base,
  } = await importModule(source, deckPath);
  return {
    config: module['seminar'],
    base:
      base ??
      installed?.directory ??
      path.resolve(path.dirname(deckPath), source),
    dependencies,
  };
}

/** Theme-specific name retained for compatibility. */
export function loadThemeConfig(
  theme: string,
  deckPath: string,
  importModule: ModuleImporter,
): Promise<LoadedSeminarConfig> {
  return loadSeminarConfig(theme, deckPath, importModule);
}

/** Theme-specific name retained for compatibility. */
export type LoadedThemeConfig = LoadedSeminarConfig;
