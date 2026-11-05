import type {
  Diagnostic,
  LanguageServicePlugin,
  VirtualCode,
} from '@volar/language-server';
import { URI } from 'vscode-uri';

import type { DirectiveProblem } from './unknownDirectives.ts';

/** The virtual code of a deck, with its unknown directives once they're known. */
export type CodeWithUnknownDirectives = VirtualCode & {
  seminarUnknownDirectives?: DirectiveProblem[] | undefined;
};

/** Severity of warnings in the protocol. */
const WARNING = 2;

/**
 * Creates the plugin that warns about the directives of decks that nothing
 * handles, like compiling them does, which the language plugin finds once the
 * directive components of the deck are known.
 */
export function createUnknownDirectivePlugin(): LanguageServicePlugin {
  return {
    name: 'seminar-unknown-directives',
    capabilities: {
      diagnosticProvider: {
        interFileDependencies: false,
        workspaceDiagnostics: false,
      },
    },
    create(context) {
      return {
        provideDiagnostics(document) {
          const decoded = context.decodeEmbeddedDocumentUri(
            URI.parse(document.uri),
          );
          const code: CodeWithUnknownDirectives | undefined =
            decoded &&
            context.language.scripts
              .get(decoded[0])
              ?.generated?.embeddedCodes.get(decoded[1]);
          return code?.seminarUnknownDirectives?.map(
            ({ start, end, message }): Diagnostic => ({
              range: {
                start: document.positionAt(start),
                end: document.positionAt(end),
              },
              message,
              severity: WARNING,
              source: 'seminar',
            }),
          );
        },
      };
    },
  };
}
