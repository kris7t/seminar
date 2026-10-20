#!/usr/bin/env node
// Taps the page shown in Chromium on an Android device or emulator, records
// the screen of the page while it changes, and prints how far the page moved
// vertically in each frame, e.g., to catch slides that bounce while they fade.
// See README.md for how to set up the emulator.

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values: options } = parseArgs({
  options: {
    url: { type: 'string' },
    tap: { type: 'string', default: '540,1300' },
    rate: { type: 'string', default: '0.1' },
    duration: { type: 'string', default: '2500' },
    port: { type: 'string', default: '9222' },
    out: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
});

if (options.help) {
  console.log(`Usage: record-tap.js [options]

  --url <url>       Load this page first, instead of using the page shown
  --tap <x,y>       Where to tap, in device pixels (default: 540,1300)
  --rate <rate>     Playback rate of animations, to catch short ones in the
                    few frames that the emulator renders (default: 0.1)
  --duration <ms>   How long to record after the tap (default: 2500)
  --port <port>     Local port forwarded to DevTools (default: 9222)
  --out <dir>       Also save the frames as PNG files in this directory`);
  process.exit(0);
}

const adb = process.env.ANDROID_HOME
  ? path.join(process.env.ANDROID_HOME, 'platform-tools', 'adb')
  : 'adb';
const [tapX, tapY] = options.tap.split(',');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

execFileSync(adb, [
  'forward',
  `tcp:${options.port}`,
  'localabstract:chrome_devtools_remote',
]);
const targets = await (
  await fetch(`http://localhost:${options.port}/json`)
).json();
const page = targets.find((target) => target.type === 'page');
if (page === undefined) {
  throw new Error('No page is open in Chromium');
}

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve);
  socket.addEventListener('error', reject);
});
let lastId = 0;
const pending = new Map();
const listeners = new Set();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  const resolve = pending.get(message.id);
  if (resolve === undefined) {
    for (const listener of listeners) {
      listener(message);
    }
  } else {
    pending.delete(message.id);
    resolve(message);
  }
});
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    lastId += 1;
    pending.set(lastId, (message) => {
      if (message.error) {
        reject(new Error(`${method}: ${message.error.message}`));
      } else {
        resolve(message.result);
      }
    });
    socket.send(JSON.stringify({ id: lastId, method, params }));
  });
}
async function evaluate(expression) {
  const { result, exceptionDetails } = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (exceptionDetails) {
    throw new Error(exceptionDetails.exception?.description ?? 'Error');
  }
  return result.value;
}

await send('Page.enable');
if (options.url !== undefined) {
  const loaded = new Promise((resolve) => {
    listeners.add((message) => {
      if (message.method === 'Page.loadEventFired') {
        resolve();
      }
    });
  });
  await send('Page.navigate', { url: options.url });
  await loaded;
  // Let the page render, e.g., its fonts and images.
  await sleep(3000);
}
await send('Animation.enable');
await send('Animation.setPlaybackRate', {
  playbackRate: Number(options.rate),
});

const frames = [];
listeners.add((message) => {
  if (message.method === 'Page.screencastFrame') {
    frames.push({ time: performance.now(), data: message.params.data });
    void send('Page.screencastFrameAck', {
      sessionId: message.params.sessionId,
    });
  }
});
await send('Page.startScreencast', { format: 'png' });
await sleep(500);
const tapTime = performance.now();
execFileSync(adb, ['shell', 'input', 'tap', tapX, tapY]);
await sleep(Number(options.duration));
await send('Page.stopScreencast');
await send('Animation.setPlaybackRate', { playbackRate: 1 });

// The page decodes the frames and finds the vertical shift of each that best
// lines up the brightness of its rows with those of the first frame.
const shifts = await evaluate(`(async () => {
  const frames = ${JSON.stringify(frames.map(({ data }) => data))};
  const rows = await Promise.all(frames.map(async (data) => {
    const response = await fetch('data:image/png;base64,' + data);
    const bitmap = await createImageBitmap(await response.blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d');
    context.drawImage(bitmap, 0, 0);
    const { data: pixels } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    const means = new Float64Array(bitmap.height);
    for (let y = 0; y < bitmap.height; y += 1) {
      let sum = 0;
      for (let x = 0; x < bitmap.width; x += 1) {
        const i = (y * bitmap.width + x) * 4;
        sum += pixels[i] + pixels[i + 1] + pixels[i + 2];
      }
      means[y] = sum / bitmap.width;
    }
    return { width: bitmap.width, means };
  }));
  const [first] = rows;
  const maxShift = Math.floor(first.means.length / 4);
  const scale = first.width / innerWidth;
  return rows.map(({ means }) => {
    let best = 0;
    let bestError = Infinity;
    for (let shift = -maxShift; shift <= maxShift; shift += 1) {
      let error = 0;
      let count = 0;
      for (let y = Math.max(0, shift); y < Math.min(means.length, means.length + shift); y += 1) {
        error += Math.abs(means[y] - first.means[y - shift]);
        count += 1;
      }
      if (error / count < bestError) {
        bestError = error / count;
        best = shift;
      }
    }
    return best / scale;
  });
})()`);

if (options.out !== undefined) {
  mkdirSync(options.out, { recursive: true });
}
console.log('time (ms)\tshift (CSS px)');
frames.forEach(({ time, data }, index) => {
  const elapsed = Math.round(time - tapTime);
  console.log(`${String(elapsed)}\t${shifts[index].toFixed(1)}`);
  if (options.out !== undefined) {
    const name = `${String(index).padStart(3, '0')}_${String(elapsed)}ms.png`;
    writeFileSync(path.join(options.out, name), Buffer.from(data, 'base64'));
  }
});
const moved = shifts.some((shift) => Math.abs(shift) >= 1);
console.log(moved ? 'The page moved.' : 'The page stayed in place.');
socket.close();
process.exitCode = moved ? 1 : 0;
