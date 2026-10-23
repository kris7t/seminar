import { stat } from 'node:fs/promises';
import path from 'node:path';

import type { ImportedModule, ModuleImporter } from '@seminar/mdx';
import { isCSSRequest, runnerImport, type Alias, type Plugin } from 'vite';

const EMPTY_MODULE = '\0seminar-empty-module';

/**
 * Replaces style sheets with empty modules, since they don't affect the
 * compile-time config of themes, and Vite can't process them when importing
 * modules at compile time.
 */
const stubStyles: Plugin = {
  name: 'seminar:stub-styles',
  enforce: 'pre',
  resolveId(source) {
    return isCSSRequest(source) ? EMPTY_MODULE : undefined;
  },
  load(id) {
    return id === EMPTY_MODULE ? 'export default {};' : undefined;
  },
};

interface CachedModule {
  imported: ImportedModule;
  /** Modification times of the dependencies when the module was imported. */
  mtimes: Map<string, number>;
}

async function getMtime(file: string): Promise<number> {
  try {
    return (await stat(file)).mtimeMs;
  } catch {
    return Number.NaN;
  }
}

async function getMtimes(files: string[]): Promise<Map<string, number>> {
  return new Map(
    await Promise.all(
      files.map(async (file) => [file, await getMtime(file)] as const),
    ),
  );
}

async function isFresh({ mtimes }: CachedModule): Promise<boolean> {
  for (const [file, mtime] of mtimes) {
    if ((await getMtime(file)) !== mtime) {
      return false;
    }
  }
  return true;
}

/**
 * Creates a {@link ModuleImporter} that imports modules with the module runner
 * of Vite, so that theme modules may be written in TypeScript and import style
 * sheets. Modules are cached until one of their files changes.
 *
 * Caveats of `runnerImport` in Vite 8:
 *
 * - Style sheets are replaced with empty modules, since the CSS plugin of Vite
 *   fails in the environment of `runnerImport`.
 * - Bare package imports are externalized, i.e., loaded by Node. Packages in
 *   a workspace must be built. Aliases apply to local imports, including
 *   dependencies of the theme or config module.
 */
export function createViteImporter(
  getOptions: () => { root: string; alias: readonly Alias[] },
): ModuleImporter {
  const cache = new Map<string, CachedModule>();
  return async (specifier, importer) => {
    const id =
      specifier.startsWith('.') || path.isAbsolute(specifier)
        ? path.resolve(path.dirname(importer), specifier)
        : specifier;
    const cached = cache.get(id);
    if (cached !== undefined && (await isFresh(cached))) {
      return cached.imported;
    }
    const files = new Set<string>();
    let base: string | undefined;
    const trackFiles: Plugin = {
      name: 'seminar:config-dependencies',
      load(file) {
        if (path.isAbsolute(file)) {
          base ??= file;
          files.add(file);
        }
      },
    };
    const { root, alias } = getOptions();
    const { module, dependencies } = await runnerImport<
      Record<string, unknown>
    >(id, {
      root,
      resolve: { alias: [...alias] },
      logLevel: 'silent',
      plugins: [stubStyles, trackFiles],
    });
    for (const file of dependencies) if (path.isAbsolute(file)) files.add(file);
    const imported = { module, base, dependencies: [...files] };
    cache.set(id, { imported, mtimes: await getMtimes([...files]) });
    return imported;
  };
}
