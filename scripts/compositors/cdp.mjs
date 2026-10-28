import { setTimeout as sleep } from 'node:timers/promises';

import { until } from './session.mjs';

/** How long to wait for an answer from the page, in milliseconds. */
const CALL_TIMEOUT = 10_000;

/** A page of Electron, driven over the Chrome DevTools Protocol. */
export class Page {
  /** The DevTools target of the page. */
  target;
  #socket;
  #nextId = 0;
  #pending = new Map();

  constructor(target) {
    this.target = target;
    this.#socket = new WebSocket(target.webSocketDebuggerUrl);
    this.#socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(String(data));
      this.#pending.get(message.id)?.(message);
      this.#pending.delete(message.id);
    });
    this.opened = new Promise((resolve, reject) => {
      this.#socket.addEventListener('open', resolve, { once: true });
      this.#socket.addEventListener('error', reject, { once: true });
    });
  }

  async call(method, params = {}, timeout = CALL_TIMEOUT) {
    const timedOut = sleep(timeout).then(() => {
      throw new Error(`${method} timed out`);
    });
    await Promise.race([this.opened, timedOut]);
    this.#nextId += 1;
    const id = this.#nextId;
    const reply = await Promise.race([
      new Promise((resolve) => {
        this.#pending.set(id, resolve);
        this.#socket.send(JSON.stringify({ id, method, params }));
      }),
      timedOut,
    ]);
    if (reply.error !== undefined) {
      throw new Error(`${method}: ${reply.error.message}`);
    }
    return reply.result;
  }

  /** Returns the value of `expression` in the page. */
  async evaluate(expression, timeout) {
    const { result, exceptionDetails } = await this.call(
      'Runtime.evaluate',
      { expression, returnByValue: true, awaitPromise: true },
      timeout,
    );
    if (exceptionDetails !== undefined) {
      throw new Error(`${expression}: ${exceptionDetails.text}`);
    }
    return result.value;
  }

  /**
   * Presses a key, as the user would, which characters like Enter need
   * `text` for. Without waiting for the page to handle it if it `closes` the
   * window, which then never answers.
   */
  async press(key, code, keyCode, text, { closes = false } = {}) {
    const events = ['keyDown', 'keyUp'].map((type) => ({
      type: type === 'keyDown' && text === undefined ? 'rawKeyDown' : type,
      key,
      code,
      windowsVirtualKeyCode: keyCode,
      ...(type === 'keyDown' && text !== undefined
        ? { text, unmodifiedText: text }
        : {}),
    }));
    try {
      if (closes) {
        await this.opened;
        for (const params of events) {
          this.#nextId += 1;
          this.#socket.send(
            JSON.stringify({
              id: this.#nextId,
              method: 'Input.dispatchKeyEvent',
              params,
            }),
          );
        }
        return;
      }
      for (const params of events) {
        await this.call('Input.dispatchKeyEvent', params);
      }
    } catch (error) {
      throw new Error(
        `Pressing ${key} in ${this.target.url}: ${error.message}`,
        {
          cause: error,
        },
      );
    }
  }

  close() {
    this.#socket.close();
  }
}

/** Returns the pages of the Electron with DevTools on `port`. */
export async function pages(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${String(port)}/json`);
    return (await response.json()).filter(({ type }) => type === 'page');
  } catch {
    // Not listening yet.
    return [];
  }
}

/**
 * Waits for a page that `matches`, and connects to it, once it answers, which
 * new windows may not do at first.
 */
export function waitForPage(port, matches, message) {
  return until(
    async () => {
      const target = (await pages(port)).find(matches);
      if (target === undefined) {
        return undefined;
      }
      const page = new Page(target);
      try {
        await page.evaluate('true', 2000);
        return page;
      } catch {
        page.close();
        return undefined;
      }
    },
    message,
    30_000,
  );
}
