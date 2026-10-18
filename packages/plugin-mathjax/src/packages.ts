import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Finds the directory of the package `name` installed for `from`, a file or a
 * directory, like Node does for imports.
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
