import assert from 'node:assert';
import path from 'node:path';

import type { Language } from '@volar/language-server';
import {
  createConnection,
  createServer,
  createTypeScriptProject,
  loadTsdkByPath,
} from '@volar/language-server/node.js';
import { URI } from 'vscode-uri';

import {
  DirectiveLoader,
  type DeckDirectiveComponents,
} from './directiveLoader.ts';
import {
  createDeckLanguagePlugin,
  type DirectiveRegistry,
} from './language.ts';
import { createDeckServicePlugins } from './services.ts';

process.title = 'seminar-language-server';

const connection = createConnection();
const server = createServer(connection);
const directives = new DirectiveLoader();
/** Changes when directive components are loaded or forgotten. */
let directivesVersion = 0;
/** The languages of the projects, to update their decks. */
const languages = new Set<Language>();
/** The decks that were given directive components, or are waiting for them. */
const decksWithDirectives = new Set<string>();
const loading = new WeakSet<Promise<DeckDirectiveComponents>>();

/** Generates the code of the decks again, e.g., with new directives. */
function updateDecks(): void {
  directivesVersion += 1;
  for (const language of languages) {
    for (const deck of decksWithDirectives) {
      language.scripts.delete(URI.file(deck));
    }
  }
  void server.languageFeatures.requestRefresh(false);
}

/**
 * Returns the directive components of a deck if they are loaded, and loads
 * them otherwise, updating the deck once they are.
 */
const directiveRegistry: DirectiveRegistry = (file, source) => {
  decksWithDirectives.add(file);
  const loaded = directives.loaded(file, source);
  if (loaded === undefined) {
    const load = directives.load(file, source);
    if (!loading.has(load)) {
      loading.add(load);
      load.then(updateDecks, () => undefined);
    }
  }
  return loaded;
};

/**
 * Returns the directive components of the deck at `uri`, as the Vite config of
 * its project registers them, or why they can't be loaded.
 */
connection.onRequest(
  'seminar/directiveComponents',
  async ({ uri }: { uri: string }) => {
    const parsed = URI.parse(uri);
    const source = server.documents.get(parsed)?.getText();
    if (source === undefined) {
      return { error: `${uri} isn't open.` };
    }
    try {
      return await directives.load(parsed.fsPath, source);
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  },
);

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
      ({ configFileName, projectHost }) => {
        // TypeScript only sees new code of decks in new versions of projects.
        const { getProjectVersion } = projectHost;
        if (getProjectVersion !== undefined) {
          projectHost.getProjectVersion = () =>
            `${getProjectVersion.call(projectHost)}:${String(directivesVersion)}`;
        }
        const setup = ({ language }: { language: Language }) => {
          languages.add(language);
        };
        if (configFileName === undefined) {
          return {
            languagePlugins: [
              createDeckLanguagePlugin(false, 'react', {
                typescript,
                registry: directiveRegistry,
              }),
            ],
            setup,
          };
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
              { typescript, registry: directiveRegistry },
            ),
          ],
          setup,
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
  server.fileWatcher.onDidChangeWatchedFiles(({ changes }) => {
    const forgot = changes
      .map(({ uri }) => directives.invalidate(URI.parse(uri).fsPath))
      .includes(true);
    if (forgot) {
      updateDecks();
    }
  });
});

connection.onShutdown(() => {
  directives.dispose();
});

connection.listen();
