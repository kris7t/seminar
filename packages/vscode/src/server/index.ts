import assert from 'node:assert';
import path from 'node:path';

import {
  createConnection,
  createServer,
  createTypeScriptProject,
  loadTsdkByPath,
} from '@volar/language-server/node.js';

import { createDeckLanguagePlugin } from './language.ts';
import { createDeckServicePlugins } from './services.ts';

process.title = 'seminar-language-server';

const connection = createConnection();
const server = createServer(connection);

connection.onInitialize((parameters) => {
  const { tsdk } = (
    parameters.initializationOptions as { typescript: { tsdk?: unknown } }
  ).typescript;
  assert.ok(typeof tsdk === 'string', 'Missing typescript.tsdk');
  const { typescript, diagnosticMessages } = loadTsdkByPath(
    tsdk,
    parameters.locale,
  );
  return server.initialize(
    parameters,
    createTypeScriptProject(
      typescript,
      diagnosticMessages,
      ({ configFileName }) => {
        if (configFileName === undefined) {
          return { languagePlugins: [createDeckLanguagePlugin()] };
        }
        const config = typescript.parseJsonSourceFileConfigFileContent(
          typescript.readJsonConfigFile(configFileName, (file) =>
            typescript.sys.readFile(file),
          ),
          typescript.sys,
          path.dirname(configFileName),
          undefined,
          configFileName,
        );
        return {
          languagePlugins: [
            createDeckLanguagePlugin(
              Boolean(
                (config.raw as { mdx?: { checkMdx?: unknown } }).mdx?.checkMdx,
              ),
              config.options.jsxImportSource,
            ),
          ],
        };
      },
    ),
    // Different copies of the same types of the protocol.
    createDeckServicePlugins(
      typescript,
      connection.workspace as unknown as Parameters<
        typeof createDeckServicePlugins
      >[1],
    ),
  );
});

connection.onInitialized(() => {
  server.initialized();
  void server.fileWatcher.watchFiles([
    '**/*.{mdx,cjs,cts,js,jsx,json,mjs,mts,ts,tsx}',
  ]);
});

connection.listen();
