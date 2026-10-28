import type { PrintOptions, SeminarHost } from '@seminar/core';
import type * as Electron from 'electron';

// Sandboxed preload scripts are CommonJS, and can only require Electron.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { contextBridge, ipcRenderer } = require('electron') as typeof Electron;

const host: SeminarHost = {
  print: ipcRenderer.sendSync('seminar:print-options') as PrintOptions,
  printReady: (printed) => {
    ipcRenderer.send('seminar:print-ready', printed);
  },
};

contextBridge.exposeInMainWorld('seminarHost', host);
