// Runs the dev server of Vite for the Vite project in the working directory,
// in a process started by `serveDeck`, and sends it the URL of the deck.
import type { AddressInfo } from 'node:net';
import { pathToFileURL } from 'node:url';

import { pagePath, type DevServerMessage } from './vite.ts';

/** What we need from the API of Vite. */
interface Vite {
  createServer: (config: {
    server: { host: string; port: number; open: boolean };
    logLevel: 'warn';
    clearScreen: boolean;
  }) => Promise<{
    config: { root: string };
    httpServer: { address: () => AddressInfo | string | null } | null;
    listen: () => Promise<unknown>;
  }>;
}

const [vite = '', deck = ''] = process.argv.slice(2);

// Don't outlive the command, even if it couldn't stop us.
process.once('disconnect', () => {
  process.exit();
});

const { createServer } = (await import(pathToFileURL(vite).href)) as Vite;
const server = await createServer({
  // Port 0 for any free port.
  server: { host: '127.0.0.1', port: 0, open: false },
  logLevel: 'warn',
  clearScreen: false,
});
await server.listen();
const address = server.httpServer?.address();
if (address === null || address === undefined || typeof address === 'string') {
  throw new Error('The dev server of Vite has no port.');
}
process.send?.({
  url: `http://127.0.0.1:${String(address.port)}/${pagePath(
    server.config.root,
    deck,
  )
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`,
} satisfies DevServerMessage);
