// Presents the example deck with `seminar present` in compositors started
// for the tests, and checks with the compositors where the windows are.
// See README.md.

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { waitForPage } from './cdp.mjs';
import { gnome } from './gnome.mjs';
import { kwin } from './kwin.mjs';
import { freePort, Session, until } from './session.mjs';
import { sway } from './sway.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const CLI = path.join(root, 'packages/cli/dist/index.js');
const DECK = path.join(root, 'packages/example/dist/index.html');

/** How long a test may take, in milliseconds. */
const TIMEOUT = 120_000;

/** Logs the steps of the tests, with `SEMINAR_E2E_DEBUG=1`. */
const debug =
  process.env.SEMINAR_E2E_DEBUG === undefined
    ? () => undefined
    : (...args) => {
        console.error('#', ...args);
      };

/** Returns the executable of Electron, downloading it if needed. */
async function electron() {
  const { findElectron, installElectron } =
    await import('../../packages/cli/dist/electron.js');
  return findElectron() ?? (await installElectron());
}

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

/**
 * Presents the example deck, with Electron listening for DevTools, and
 * returns the presenter window of the deck.
 */
async function present({ session, compositor, executable, decks }) {
  const port = await freePort();
  const wrapper = await session.writeFile(
    `electron-${String(port)}.sh`,
    `#!/bin/sh\nexec ${shellQuote(executable)} --remote-debugging-port=${String(port)} "$@"\n`,
    0o755,
  );
  const cli = session.spawn(process.execPath, [CLI, 'present', DECK], {
    env: { ...compositor.env, SEMINAR_ELECTRON: wrapper },
    cwd: root,
  });
  decks.add(cli);
  debug('started seminar present');
  let presenter;
  try {
    presenter = await Promise.race([
      waitForPage(port, ({ url }) => url.startsWith('seminar:'), 'the deck'),
      cli.exited.then(({ code }) => {
        throw new Error(`seminar present exited with ${String(code)}`);
      }),
    ]);
  } catch (error) {
    await session.kill(cli);
    throw new Error(`${error.message}\n${cli.output}`, { cause: error });
  }
  return {
    cli,
    port,
    presenter,
    audience: () =>
      waitForPage(port, ({ url }) => url === 'about:blank', 'the audience'),
    /** Closes the deck, and returns how the command line exited. */
    async close() {
      await presenter.evaluate('window.close()').catch(() => undefined);
      presenter.close();
      const exit = await Promise.race([
        cli.exited,
        until(() => false, 'seminar present to exit', 15_000),
      ]).finally(() => session.kill(cli));
      return { ...exit, output: cli.output };
    },
  };
}

/**
 * Waits for the screen dialog, and returns its choices, with the output of
 * the compositor that each shows.
 */
async function screenChoices(presenter, outputs) {
  await until(
    () =>
      presenter.evaluate('document.querySelector("[role=dialog]") !== null'),
    'the screen dialog',
  );
  const screens = await presenter.evaluate(`(async () => {
    const { screens } = await getScreenDetails();
    const radios = document.querySelectorAll('[role=dialog] input[type=radio]');
    return screens.map((screen, index) => ({
      left: screen.left,
      top: screen.top,
      checked: radios[index].checked,
      current: radios[index].closest('label').innerText.includes('this window is here'),
    }));
  })()`);
  return screens.map((screen) => ({
    ...screen,
    output: outputs.find(
      (output) => output.x === screen.left && output.y === screen.top,
    ),
  }));
}

/** Returns the window of the compositor that is in full screen, if any. */
async function fullscreenWindow(compositor) {
  const windows = await compositor.windows();
  debug('windows', windows);
  return windows.find(({ fullscreen }) => fullscreen);
}

for (const target of [sway, kwin, gnome]) {
  describe(
    target.name,
    { skip: !target.available() && `no ${target.name}` },
    () => {
      const context = { decks: new Set() };

      before(async () => {
        if (!existsSync(CLI) || !existsSync(DECK)) {
          throw new Error(
            'Build the command line and the example first: npm run build',
          );
        }
        context.executable = await electron();
        context.session = await Session.start();
        context.compositor = await target.start(context.session);
      });

      // Even after tests that failed halfway.
      afterEach(async () => {
        for (const cli of context.decks) {
          if (process.env.SEMINAR_E2E_DEBUG !== undefined) {
            debug('output of seminar present:', cli.output);
          }
          await context.session.kill(cli);
        }
        context.decks.clear();
      });

      after(async () => {
        context.compositor?.stop?.();
        await context.session?.stop();
      });

      it(
        'shows the slides in full screen on the other screen',
        { timeout: TIMEOUT },
        async () => {
          const { compositor } = context;
          const deck = await present(context);
          const outputs = await compositor.outputs();
          const choices = await screenChoices(deck.presenter, outputs);
          const [presenterWindow] = await compositor.windows();
          debug('screens', choices, 'presenter', presenterWindow);
          const current = choices.find(({ current }) => current);
          assert.equal(
            current?.output?.name,
            presenterWindow?.output,
            'the screen of the presenter',
          );
          const chosen = choices.find(({ checked }) => checked);
          assert.notEqual(
            chosen?.output?.name,
            presenterWindow?.output,
            'the screen chosen by default',
          );

          await deck.presenter.press('Enter', 'Enter', 13, '\r');
          const audienceWindow = await until(
            () => fullscreenWindow(compositor),
            'the slides in full screen',
          );
          debug('slides', audienceWindow);
          assert.equal(audienceWindow.output, chosen.output.name);
          assert.deepEqual(
            [audienceWindow.width, audienceWindow.height],
            [chosen.output.width, chosen.output.height],
          );
          const audience = await deck.audience();
          debug('connected to the slides');
          // The page may be resized after the compositor has told us.
          await until(async () => {
            const [width, height] = await audience.evaluate(
              '[innerWidth, innerHeight]',
            );
            return (
              width === chosen.output.width && height === chosen.output.height
            );
          }, 'the slides to fill the screen');

          // Escape ends the presentation.
          await audience.press('Escape', 'Escape', 27, undefined, {
            closes: true,
          });
          debug('pressed Escape');
          await until(
            async () => (await compositor.windows()).length === 1,
            'the slides to close',
          );
          assert.doesNotMatch(
            await deck.presenter.evaluate('document.title'),
            /Presenter view/,
          );

          const { code, output } = await deck.close();
          assert.equal(code, 0, output);
        },
      );

      it(
        'ends the presentation when the compositor leaves full screen',
        {
          timeout: TIMEOUT,
          skip:
            target.leavesFullscreen === false &&
            `${target.name} can't leave full screen`,
        },
        async () => {
          const { compositor } = context;
          const deck = await present(context);
          await screenChoices(deck.presenter, await compositor.outputs());
          await deck.presenter.press('Enter', 'Enter', 13, '\r');
          const audienceWindow = await until(
            () => fullscreenWindow(compositor),
            'the slides in full screen',
          );
          debug('slides', audienceWindow);
          await compositor.leaveFullscreen(audienceWindow);
          debug('left full screen', await compositor.windows());
          await until(
            async () => (await compositor.windows()).length === 1,
            'the slides to close',
          );
          const { code, output } = await deck.close();
          assert.equal(code, 0, output);
        },
      );

      it(
        'knows the screen of the presenter after it moves',
        { timeout: TIMEOUT },
        async () => {
          const { compositor } = context;
          const deck = await present(context);
          const outputs = await compositor.outputs();
          await screenChoices(deck.presenter, outputs);
          await deck.presenter.press('Escape', 'Escape', 27);
          await until(
            () =>
              deck.presenter.evaluate(
                'document.querySelector("[role=dialog]") === null',
              ),
            'the screen dialog to close',
          );
          const [presenterWindow] = await compositor.windows();
          const other = outputs.find(
            ({ name }) => name !== presenterWindow.output,
          );
          await compositor.moveWindow(presenterWindow, other.name);
          await until(
            async () => (await compositor.windows())[0]?.output === other.name,
            'the presenter window to move',
          );

          await deck.presenter.press('p', 'KeyP', 80, 'p');
          const choices = await screenChoices(deck.presenter, outputs);
          assert.equal(
            choices.find(({ current }) => current)?.output?.name,
            other.name,
          );
          await deck.presenter.press('Escape', 'Escape', 27);
          const { code, output } = await deck.close();
          assert.equal(code, 0, output);
        },
      );

      it(
        'opens the presenter view if the window moved while choosing',
        { timeout: TIMEOUT },
        async () => {
          const { compositor } = context;
          const deck = await present(context);
          const outputs = await compositor.outputs();
          await screenChoices(deck.presenter, outputs);
          const [presenterWindow] = await compositor.windows();
          const original = presenterWindow.output;
          const other = outputs.find(({ name }) => name !== original);
          await compositor.moveWindow(presenterWindow, other.name);
          const choices = await until(async () => {
            const current = await screenChoices(deck.presenter, outputs);
            return (
              current.find(({ current }) => current)?.output?.name ===
                other.name && current
            );
          }, 'the dialog to notice the move');

          // The screen that the window was on when the dialog opened.
          const index = choices.findIndex(
            ({ output }) => output?.name === original,
          );
          await deck.presenter.evaluate(
            `document.querySelectorAll('[role=dialog] input[type=radio]')[${String(index)}].click()`,
          );
          await deck.presenter.press('Enter', 'Enter', 13, '\r');
          const audienceWindow = await until(
            () => fullscreenWindow(compositor),
            'the slides in full screen',
          );
          assert.equal(audienceWindow.output, original);
          await until(
            async () =>
              /Presenter view/.test(
                await deck.presenter.evaluate('document.title'),
              ),
            'the presenter view',
          );
          const { code, output } = await deck.close();
          assert.equal(code, 0, output);
        },
      );

      if (target === kwin) {
        it(
          'unloads scripts that crashed processes left loaded',
          { timeout: TIMEOUT },
          async () => {
            const { session, compositor } = context;
            // A process that is gone, like one that crashed.
            const gone = session.spawn(process.execPath, ['-e', '']);
            await gone.exited;
            const plugin = `seminar-${String(gone.pid)}-0`;
            const directory = path.join(
              session.env.XDG_RUNTIME_DIR,
              `seminar-kwin-${String(gone.pid)}`,
            );
            await mkdir(directory);
            await writeFile(path.join(directory, '0.js'), '');
            await compositor.loadScript(path.join(directory, '0.js'), plugin);
            assert.equal(await compositor.isScriptLoaded(plugin), true);

            const deck = await present(context);
            await screenChoices(deck.presenter, await compositor.outputs());
            assert.equal(await compositor.isScriptLoaded(plugin), false);
            assert.equal(existsSync(directory), false);
            await deck.presenter.press('Escape', 'Escape', 27);
            const { code, output } = await deck.close();
            assert.equal(code, 0, output);
          },
        );
      }
    },
  );
}
