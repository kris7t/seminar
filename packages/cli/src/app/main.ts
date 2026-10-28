import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { PrintedDocument } from '@seminar/core';
import { app, BrowserWindow, net, protocol } from 'electron';

import { PRINT_FAILED, type PdfDeck, type PdfJob } from '../job.ts';
import { addDocumentInfo } from '../pdf/documentInfo.ts';

/** Scheme that serves the pages of decks, and the files that they load. */
const SCHEME = 'seminar';

/** How long to wait for a deck to be ready to print, in milliseconds. */
const READY_TIMEOUT = 120_000;

const PRELOAD = fileURLToPath(new URL('./preload.cjs', import.meta.url));

const job = JSON.parse(process.argv.at(-1) ?? '') as PdfJob;

// Unlike `file:`, served files can be modules, and fetched.
protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

/** Directories served, by the host of their URLs. */
const roots = new Map<string, string>();

function serve(request: Request): Promise<Response> | Response {
  const url = new URL(request.url);
  const root = roots.get(url.host);
  if (root === undefined) {
    return new Response(null, { status: 404 });
  }
  const file = path.join(root, decodeURIComponent(url.pathname));
  const relative = path.relative(root, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return new Response(null, { status: 404 });
  }
  return net
    .fetch(pathToFileURL(file).href)
    .catch(() => new Response(null, { status: 404 }));
}

async function printDeck(deck: PdfDeck, host: string): Promise<void> {
  roots.set(host, deck.root);
  const window = new BrowserWindow({
    show: false,
    width: 1280,
    height: 720,
    webPreferences: { preload: PRELOAD, sandbox: true, contextIsolation: true },
  });
  const { webContents } = window;
  try {
    webContents.ipc.on('seminar:print-options', (event) => {
      event.returnValue = job.print;
    });
    webContents.on('console-message', ({ level, message }) => {
      if (level === 'error' || level === 'warning') {
        console.log(`${deck.page}: ${message}`);
      }
    });
    const ready = new Promise<PrintedDocument>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(
          new Error(
            `The deck wasn't ready to print after ${String(READY_TIMEOUT / 1000)} seconds`,
          ),
        );
      }, READY_TIMEOUT);
      webContents.ipc.once(
        'seminar:print-ready',
        (_, printed: PrintedDocument) => {
          clearTimeout(timeout);
          resolve(printed);
        },
      );
      webContents.once('render-process-gone', (_, { reason }) => {
        clearTimeout(timeout);
        reject(new Error(`The page stopped: ${reason}`));
      });
    });
    const url = `${SCHEME}://${host}/${deck.page.split('/').map(encodeURIComponent).join('/')}`;
    const [, printed] = await Promise.all([window.loadURL(url), ready]);
    const pdf = await webContents.printToPDF({
      preferCSSPageSize: true,
      printBackground: true,
      pageSize: job.paper,
    });
    await mkdir(path.dirname(deck.output), { recursive: true });
    await writeFile(deck.output, await addDocumentInfo(pdf, printed));
  } finally {
    window.destroy();
    roots.delete(host);
  }
}

app.dock?.hide();

// Keep running until every deck is printed.
app.on('window-all-closed', () => undefined);

async function printDecks(): Promise<void> {
  protocol.handle(SCHEME, serve);
  let failed = false;
  for (const [index, deck] of job.decks.entries()) {
    try {
      await printDeck(deck, `deck${String(index)}`);
      console.log(`Wrote ${deck.label}`);
    } catch (error) {
      failed = true;
      console.log(
        `Could not print ${deck.page}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  app.exit(failed ? PRINT_FAILED : 0);
}

// Not awaited at the top level, which Electron waits for before it is ready.
void app.whenReady().then(printDecks);
