// Sends the root of the Vite project in the working directory, as its config
// sets it, to the process started by `findRoot`.
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { RootMessage } from './vite.ts';

/** What we need from the API of Vite. */
interface Vite {
  loadConfigFromFile: (
    configEnv: {
      command: 'build';
      mode: string;
      isSsrBuild: boolean;
      isPreview: boolean;
    },
    configFile: undefined,
    configRoot: string,
  ) => Promise<{ config: { root?: string } } | null>;
}

const [vite = ''] = process.argv.slice(2);
const { loadConfigFromFile } = (await import(pathToFileURL(vite).href)) as Vite;
const loaded = await loadConfigFromFile(
  { command: 'build', mode: 'production', isSsrBuild: false, isPreview: false },
  undefined,
  process.cwd(),
);
process.send?.(
  // Vite resolves the root from the working directory, where it is run.
  { root: path.resolve(loaded?.config.root ?? '.') } satisfies RootMessage,
  () => {
    process.disconnect();
  },
);
