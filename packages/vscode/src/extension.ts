import { homedir } from 'node:os';

import * as languageServerProtocol from '@volar/language-server/protocol.js';
import {
  activateAutoInsertion,
  activateDocumentDropEdit,
  createLabsInfo,
  getTsdk,
} from '@volar/vscode';
import { LanguageClient, TransportKind } from '@volar/vscode/node.js';
import {
  commands,
  extensions,
  ProcessExecution,
  Task,
  TaskPanelKind,
  tasks,
  TaskScope,
  window,
  workspace,
  type Disposable,
  type ExtensionContext,
  type Uri,
} from 'vscode';

import { findCli } from './cli.ts';
import { DeckPreviews } from './previews.ts';

const DECK_LANGUAGE = 'seminar-deck';

let client: LanguageClient | undefined;

/** Registers the command that runs `seminar present` on a deck in a task. */
function registerPresentCommand(): Disposable {
  const command = 'present';
  return commands.registerCommand(
    'seminar.present',
    async (uri: Uri | undefined = window.activeTextEditor?.document.uri) => {
      if (uri === undefined) {
        return;
      }
      const deck = uri.fsPath;
      const cli = findCli(deck);
      if (cli === undefined) {
        await window.showErrorMessage(
          `Install @seminar/cli in the project of this deck to ${command} it, e.g., with npm install --save-dev @seminar/cli.`,
        );
        return;
      }
      const folder = workspace.getWorkspaceFolder(uri);
      const task = new Task(
        { type: 'seminar', command, deck },
        folder ?? TaskScope.Workspace,
        `${command} ${workspace.asRelativePath(uri)}`,
        'Seminar',
        new ProcessExecution('node', [cli, command, deck], {
          // The only one that tasks may have without a folder open. `seminar`
          // finds the project from the path of the deck.
          cwd: folder?.uri.fsPath ?? homedir(),
        }),
      );
      task.presentationOptions = { panel: TaskPanelKind.Dedicated };
      await tasks.executeTask(task);
    },
  );
}

export async function activate(context: ExtensionContext) {
  // Before the language server, so that they work if it can't start.
  context.subscriptions.push(
    registerPresentCommand(),
    new DeckPreviews(context),
    // E.g., for changes to the configs of decks that the editor doesn't
    // tell, like those of installed packages.
    commands.registerCommand('seminar.restartLanguageServer', async () => {
      await client?.restart();
    }),
  );
  // It provides the TypeScript that the language server loads.
  await extensions
    .getExtension('vscode.typescript-language-features')
    ?.activate();
  const tsdk = await getTsdk(context);
  client = new LanguageClient(
    DECK_LANGUAGE,
    'Seminar',
    {
      module: context.asAbsolutePath('dist/server.cjs'),
      transport: TransportKind.ipc,
    },
    {
      documentSelector: [{ language: DECK_LANGUAGE }],
      initializationOptions: { typescript: { tsdk: tsdk?.tsdk ?? '' } },
      markdown: { supportHtml: true },
    },
  );
  await client.start();
  context.subscriptions.push(
    activateAutoInsertion(DECK_LANGUAGE, client),
    activateDocumentDropEdit(DECK_LANGUAGE, client),
  );
  const labs = createLabsInfo(languageServerProtocol);
  labs.addLanguageClient(client);
  return labs.extensionExports;
}

export async function deactivate() {
  await client?.stop();
}
