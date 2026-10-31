import { readFileSync } from 'node:fs';
import path from 'node:path';

import { findPackage } from '@seminar/mdx/syntax';

/**
 * Returns the script to run with Node for the `seminar` command of the
 * `@seminar/cli` of the project of the file `deck`, or `undefined` if it isn't
 * installed.
 */
export function findCli(deck: string): string | undefined {
  const cli = findPackage('@seminar/cli', deck);
  if (cli === undefined) {
    return undefined;
  }
  const { bin } = JSON.parse(
    readFileSync(path.join(cli, 'package.json'), 'utf8'),
  ) as { bin: { seminar: string } };
  return path.join(cli, bin.seminar);
}
