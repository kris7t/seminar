import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { exports, type Options } from 'resolve.exports';

/**
 * Finds the directory of the package `name` installed for `from`, which is a
 * file or a directory, like Node does: by looking in `node_modules` folders of
 * `from` and its ancestors.
 */
export function findPackage(name: string, from: string): string | undefined {
  let directory =
    existsSync(from) && statSync(from).isDirectory()
      ? from
      : path.dirname(from);
  for (;;) {
    const candidate = path.join(directory, 'node_modules', name);
    if (existsSync(path.join(candidate, 'package.json'))) {
      return candidate;
    }
    const parent = path.dirname(directory);
    if (parent === directory) {
      return undefined;
    }
    directory = parent;
  }
}

/** Splits a bare module specifier into the name of a package and a subpath. */
export function splitSpecifier(
  specifier: string,
): [name: string, subpath: string] {
  const parts = specifier.split('/');
  const length = specifier.startsWith('@') ? 2 : 1;
  const subpath = parts.slice(length).join('/');
  return [
    parts.slice(0, length).join('/'),
    subpath === '' ? '.' : `./${subpath}`,
  ];
}

/** Whether `specifier` refers to a package instead of a file. */
export function isBareSpecifier(specifier: string): boolean {
  return !(
    specifier.startsWith('.') ||
    path.isAbsolute(specifier) ||
    specifier.startsWith('file:')
  );
}

/** An installed package. */
export interface InstalledPackage {
  directory: string;
  /** The contents of the `package.json` of the package. */
  manifest: Record<string, unknown>;
}

/** Reads the package of the bare module specifier `specifier`. */
export function readPackage(
  specifier: string,
  from: string,
): InstalledPackage | undefined {
  const directory = findPackage(splitSpecifier(specifier)[0], from);
  if (directory === undefined) {
    return undefined;
  }
  const manifest = JSON.parse(
    readFileSync(path.join(directory, 'package.json'), 'utf8'),
  ) as Record<string, unknown>;
  return { directory, manifest };
}

/**
 * Resolves a bare module specifier with the `exports` of its package.
 *
 * @returns The path of the module, or `undefined` if the export doesn't
 *   exist.
 */
export function resolveExport(
  specifier: string,
  { directory, manifest }: InstalledPackage,
  options: Options,
): string | undefined {
  let resolved: ReturnType<typeof exports>;
  try {
    resolved = exports(manifest, splitSpecifier(specifier)[1], options);
  } catch {
    return undefined;
  }
  const [target] = resolved ?? [];
  return target === undefined ? undefined : path.join(directory, target);
}
