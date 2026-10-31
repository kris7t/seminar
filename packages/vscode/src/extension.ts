import * as languageServerProtocol from '@volar/language-server/protocol.js';
import {
  activateAutoInsertion,
  activateDocumentDropEdit,
  createLabsInfo,
  getTsdk,
} from '@volar/vscode';
import { LanguageClient, TransportKind } from '@volar/vscode/node.js';
import { extensions, type ExtensionContext } from 'vscode';

const DECK_LANGUAGE = 'seminar-deck';

let client: LanguageClient | undefined;

export async function activate(context: ExtensionContext) {
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
