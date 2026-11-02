import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { basename } from 'node:path';
import {
  commands,
  env,
  ProcessExecution,
  Task,
  TaskPanelKind,
  tasks,
  TaskScope,
  UIKind,
  Uri,
  ViewColumn,
  window,
  workspace,
  type Disposable,
  type ExtensionContext,
  type OutputChannel,
  type WebviewPanel,
} from 'vscode';

import { deckPage, findCli, findProject } from './cli.ts';
import { DeckSync } from './deckSync.ts';
import {
  DevServers,
  runSeminarDev,
  type DevServerLease,
} from './devServers.ts';
import {
  EMBEDDED_QUERY,
  previewHtml,
  type PreviewContent,
} from './previewPage.ts';

const VIEW_TYPE = 'seminar.preview';

const CLI_MISSING =
  'Install @seminar/cli in the project of this deck to preview it, e.g., with npm install --save-dev @seminar/cli.';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The panel previewing a deck. */
interface Preview {
  panel: WebviewPanel;
  /** Starts showing the deck again, if it had to give up, or `undefined`. */
  retry: (() => void) | undefined;
  /** Whether the panel was closed. */
  disposed: boolean;
}

/**
 * Previews decks in panels of the editor or in windows of their own, with one
 * dev server for each project.
 */
export class DeckPreviews implements Disposable {
  readonly #extensionUri: Uri;
  readonly #previews = new Map<string, Preview>();
  readonly #output: OutputChannel =
    window.createOutputChannel('Seminar Dev Server');
  readonly #servers = new DevServers(async (project, events) => {
    let shownErrors = false;
    // From the project itself, whichever deck starts its dev server.
    const cli = findCli(`${project}/package.json`);
    if (cli === undefined) {
      throw new Error(CLI_MISSING);
    }
    return runSeminarDev(cli, project, {
      ...events,
      onMessage: (message, root) => {
        this.#sync.receive(project, root, message);
      },
      // Forwarded ports only have local addresses in desktop editors.
      allowAnyHost: env.uiKind === UIKind.Web,
      log: (text) => {
        this.#output.append(text);
      },
      // Once for each dev server, and not again if it's closed afterwards.
      onErrors: () => {
        if (!shownErrors) {
          shownErrors = true;
          this.#output.show(true);
        }
      },
    });
  });
  readonly #sync = new DeckSync((project, message) => {
    this.#servers.send(project, message);
  });
  readonly #disposables: Disposable[];

  constructor({ extensionUri }: ExtensionContext) {
    this.#extensionUri = extensionUri;
    const command = (
      name: string,
      preview: (deck: Uri) => void | Promise<void>,
    ): Disposable =>
      commands.registerCommand(
        name,
        async (
          uri: Uri | undefined = window.activeTextEditor?.document.uri,
        ) => {
          if (uri !== undefined) {
            await workspace.save(uri);
            await preview(uri);
          }
        },
      );
    this.#disposables = [
      this.#output,
      this.#sync,
      command('seminar.preview', async (uri) => {
        if (
          workspace.getConfiguration('seminar.preview', uri).get('location') ===
          'window'
        ) {
          await this.#showInWindow(uri);
        } else {
          this.#showInEditor(uri);
        }
      }),
      command('seminar.previewInEditor', (uri) => {
        this.#showInEditor(uri);
      }),
      command('seminar.previewInWindow', (uri) => this.#showInWindow(uri)),
      commands.registerCommand('seminar.showDevServerOutput', () => {
        this.#output.show();
      }),
      window.registerWebviewPanelSerializer(VIEW_TYPE, {
        deserializeWebviewPanel: (
          panel,
          state: { deck?: string } | undefined,
        ) => {
          if (state?.deck === undefined) {
            panel.dispose();
          } else {
            this.#attach(panel, state.deck);
          }
          return Promise.resolve();
        },
      }),
    ];
  }

  dispose(): void {
    for (const disposable of this.#disposables) {
      disposable.dispose();
    }
    this.#servers.dispose();
  }

  /** Returns a lease of the dev server of `deck`, or says why it can't. */
  async #acquire(deck: string): Promise<DevServerLease> {
    const project = findProject(deck);
    if (project === undefined) {
      throw new Error(
        `${deck} isn't in a Vite project with a Vite config, e.g., vite.config.ts.`,
      );
    }
    try {
      return await this.#servers.acquire(project);
    } catch (error) {
      const message = errorMessage(error);
      throw new Error(
        message.includes('Unknown command')
          ? 'Update @seminar/cli in the project of this deck to preview it.'
          : message,
        { cause: error },
      );
    }
  }

  #showInEditor(uri: Uri): void {
    const existing = this.#previews.get(uri.fsPath);
    if (existing !== undefined) {
      existing.panel.reveal(undefined, true);
      existing.retry?.();
      return;
    }
    this.#attach(
      window.createWebviewPanel(
        VIEW_TYPE,
        '',
        { viewColumn: ViewColumn.Beside, preserveFocus: true },
        // Hiding the panel shouldn't lose the place in the deck.
        { enableScripts: true, retainContextWhenHidden: true },
      ),
      uri.fsPath,
    );
  }

  /** Shows the preview of `deck` in `panel` until the panel is closed. */
  #attach(panel: WebviewPanel, deck: string): void {
    const preview: Preview = { panel, retry: undefined, disposed: false };
    this.#previews.set(deck, preview);
    panel.title = `Preview ${basename(deck, '.deck.mdx')}`;
    panel.iconPath = {
      light: Uri.joinPath(this.#extensionUri, 'assets/file-icon-light.svg'),
      dark: Uri.joinPath(this.#extensionUri, 'assets/file-icon-dark.svg'),
    };
    let lease: DevServerLease | undefined;
    const show = (content: PreviewContent) => {
      panel.webview.html = previewHtml(
        deck,
        content,
        randomBytes(16).toString('hex'),
      );
    };
    panel.onDidDispose(() => {
      preview.disposed = true;
      lease?.release();
      this.#previews.delete(deck);
    });
    // Closing the panel may happen while waiting.
    const isClosed = () => preview.disposed;
    const load = async () => {
      show({ message: 'Starting the dev server…' });
      const acquired = await this.#acquire(deck);
      lease = acquired;
      if (isClosed()) {
        acquired.release();
        return;
      }
      const page = await this.#pageForClient(acquired, deck, EMBEDDED_QUERY);
      if (isClosed()) {
        return;
      }
      show({ page });
      await acquired.exited;
      if (!isClosed()) {
        throw new Error(
          'The dev server of this deck stopped. Preview the deck again to restart it.',
        );
      }
    };
    const start = () => {
      preview.retry = undefined;
      load().catch(async (error: unknown) => {
        lease?.release();
        lease = undefined;
        if (isClosed()) {
          return;
        }
        const message = errorMessage(error);
        this.#output.appendLine(message);
        show({ message });
        preview.retry = start;
        await window.showErrorMessage(message);
      });
    };
    start();
  }

  /** Returns the URL of the page of `deck` that the editor can reach. */
  async #pageForClient(
    { url, root }: DevServerLease,
    deck: string,
    query?: string,
  ): Promise<string> {
    const external = await env.asExternalUri(Uri.parse(url));
    const page = deckPage(String(external), root, deck, query);
    if (page === undefined) {
      throw new Error(`${deck} isn't in the root of its project, ${root}.`);
    }
    return page;
  }

  async #showInWindow(uri: Uri): Promise<void> {
    const deck = uri.fsPath;
    let lease: DevServerLease | undefined;
    try {
      lease = await this.#acquire(deck);
      if (env.remoteName !== undefined || env.uiKind === UIKind.Web) {
        // Electron would run on the remote machine, far from the presenter.
        // The dev server stays as long as the page is connected to it.
        await env.openExternal(
          Uri.parse(await this.#pageForClient(lease, deck)),
        );
        lease.release();
        return;
      }
      const cli = findCli(deck);
      if (cli === undefined) {
        throw new Error(CLI_MISSING);
      }
      const page = deckPage(lease.url, lease.root, deck);
      if (page === undefined) {
        throw new Error(
          `${deck} isn't in the root of its project, ${lease.root}.`,
        );
      }
      const folder = workspace.getWorkspaceFolder(uri);
      const task = new Task(
        { type: 'seminar', command: 'preview', deck },
        folder ?? TaskScope.Workspace,
        `preview ${workspace.asRelativePath(uri)}`,
        'Seminar',
        new ProcessExecution('node', [cli, 'preview', '--url', page], {
          // The only one that tasks may have without a folder open.
          cwd: folder?.uri.fsPath ?? homedir(),
        }),
      );
      task.presentationOptions = { panel: TaskPanelKind.Dedicated };
      const execution = await tasks.executeTask(task);
      const { release } = lease;
      const ended = tasks.onDidEndTask((event) => {
        if (event.execution === execution) {
          ended.dispose();
          release();
        }
      });
    } catch (error) {
      lease?.release();
      await window.showErrorMessage(errorMessage(error));
    }
  }
}
