// Resolves the Vite config of the project in the working directory, like Vite
// would, and sends the directive components of the decks that the language
// server asks for, as the Seminar plugin of the config registers them.
import { pathToFileURL } from 'node:url';

import type {
  DirectiveRequest,
  DirectiveResponse,
  DeckDirectiveComponents,
} from './directiveLoader.ts';

/** What we need from the API of Vite. */
interface Vite {
  resolveConfig: (
    inlineConfig: object,
    command: 'serve',
  ) => Promise<{
    plugins: readonly object[];
    configFileDependencies: string[];
  }>;
}

/** What we need from the plugin of `@seminar/rollup-plugin`. */
interface SeminarPlugin {
  directiveComponents: (
    source: string,
    deckPath: string,
  ) => Promise<DeckDirectiveComponents>;
}

function isSeminarPlugin(plugin: object): plugin is SeminarPlugin {
  return (
    typeof (plugin as Partial<SeminarPlugin>).directiveComponents === 'function'
  );
}

function send(response: DirectiveResponse): void {
  process.send?.(response);
}

async function main(): Promise<void> {
  const [vite = ''] = process.argv.slice(2);
  const { resolveConfig } = (await import(pathToFileURL(vite).href)) as Vite;
  const { plugins, configFileDependencies } = await resolveConfig(
    { logLevel: 'silent' },
    'serve',
  );
  const plugin = plugins.find(isSeminarPlugin);
  process.on('message', ({ id, deck, source }: DirectiveRequest) => {
    if (plugin === undefined) {
      send({
        id,
        error:
          'The Vite config has no Seminar plugin that tells its directives.',
      });
      return;
    }
    plugin.directiveComponents(source, deck).then(
      (components) => {
        send({ id, components });
      },
      (error: unknown) => {
        send({ id, error: String(error) });
      },
    );
  });
  // Exits with the language server, which then disconnects.
  process.on('disconnect', () => {
    process.exit();
  });
  send({ ready: true, dependencies: configFileDependencies });
}

main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
