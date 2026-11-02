// Runs the dev server of Vite for the Vite project in the working directory,
// in a process started by `serveDeck` or `serveProject`, and sends it the URL
// of the dev server.
import type { AddressInfo } from 'node:net';
import { pathToFileURL } from 'node:url';

import { devServerPlugin, type DevServerPlugin } from './devServerPlugin.ts';
import { ALLOW_ANY_HOST, type DevServerMessage } from './vite.ts';

/** What we need from the API of Vite. */
interface Vite {
  createServer: (config: {
    server: {
      host: string;
      port: number;
      open: boolean;
      allowedHosts?: true;
      forwardConsole: { unhandledErrors: boolean; logLevels: string[] };
    };
    plugins: DevServerPlugin[];
    logLevel: 'warn';
    clearScreen: boolean;
  }) => Promise<{
    config: { root: string };
    httpServer: { address: () => AddressInfo | string | null } | null;
    listen: () => Promise<unknown>;
  }>;
}

const [vite = '', ...args] = process.argv.slice(2);

function send(message: DevServerMessage): void {
  process.send?.(message);
}

// Don't outlive the command, even if it couldn't stop us.
process.once('disconnect', () => {
  process.exit();
});

const { createServer } = (await import(pathToFileURL(vite).href)) as Vite;
const server = await createServer({
  server: {
    // Port 0 for any free port.
    host: '127.0.0.1',
    port: 0,
    open: false,
    ...(args.includes(ALLOW_ANY_HOST) ? { allowedHosts: true } : {}),
    // Prints the errors of pages, wherever they are shown.
    forwardConsole: { unhandledErrors: true, logLevels: ['warn', 'error'] },
  },
  plugins: [
    devServerPlugin((count) => {
      send({ type: 'pages', count });
    }),
  ],
  logLevel: 'warn',
  clearScreen: false,
});
await server.listen();
const address = server.httpServer?.address();
if (address === null || address === undefined || typeof address === 'string') {
  throw new Error('The dev server of Vite has no port.');
}
send({
  type: 'ready',
  url: `http://127.0.0.1:${String(address.port)}/`,
  root: server.config.root,
});
