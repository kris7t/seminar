import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { PrintedDocument } from '@seminar/core';
import { app, BrowserWindow } from 'electron';

import {
  PRINT_FAILED,
  type HostOptions,
  type PdfDeck,
  type PdfJob,
  type PdfOutput,
} from '../job.ts';
import { addDocumentInfo } from '../pdf/documentInfo.ts';
import {
  PRELOAD,
  pageUrl,
  registerScheme,
  roots,
  serveRoots,
} from './serve.ts';

/** How long to wait for a deck to be ready to print, in milliseconds. */
const READY_TIMEOUT = 120_000;

const job = JSON.parse(process.argv.at(-1) ?? '') as PdfJob;

registerScheme();

async function printDeck(
  deck: PdfDeck,
  { print, output }: PdfOutput,
  host: string,
): Promise<void> {
  roots.set(host, deck.root);
  const window = new BrowserWindow({
    show: false,
    width: 1280,
    height: 720,
    webPreferences: { preload: PRELOAD, sandbox: true, contextIsolation: true },
  });
  const { webContents } = window;
  try {
    webContents.ipc.on('seminar:host', (event) => {
      event.returnValue = { print } satisfies HostOptions;
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
    const [, printed] = await Promise.all([
      window.loadURL(pageUrl(host, deck.page)),
      ready,
    ]);
    const pdf = await webContents.printToPDF({
      preferCSSPageSize: true,
      printBackground: true,
      pageSize: job.paper,
    });
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, await addDocumentInfo(pdf, printed));
  } finally {
    window.destroy();
    roots.delete(host);
  }
}

app.dock?.hide();

// Keep running until every deck is printed.
app.on('window-all-closed', () => undefined);

async function printDecks(): Promise<void> {
  serveRoots();
  let failed = false;
  for (const [index, deck] of job.decks.entries()) {
    for (const pdf of deck.pdfs) {
      try {
        await printDeck(deck, pdf, `deck${String(index)}`);
        console.log(`Wrote ${pdf.label}`);
      } catch (error) {
        failed = true;
        console.log(
          `Could not print ${pdf.label}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
  app.exit(failed ? PRINT_FAILED : 0);
}

// Not awaited at the top level, which Electron waits for before it is ready.
void app.whenReady().then(printDecks);
