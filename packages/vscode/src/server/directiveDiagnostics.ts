import type {
  Diagnostic,
  LanguageServicePlugin,
  VirtualCode,
} from '@volar/language-server';
import { URI } from 'vscode-uri';

import type { DirectiveProblem } from './directiveProblems.ts';

/**
 * The virtual code of a deck, with the problems with its directives once their
 * components are known.
 */
export type CodeWithDirectiveProblems = VirtualCode & {
  seminarDirectiveProblems?: DirectiveProblem[] | undefined;
};

/** Severity of warnings in the protocol. */
const WARNING = 2;

/**
 * Creates the plugin that warns about the directives of decks that nothing
 * handles, or that aren't written as their components take them, like
 * compiling them does, which the language plugin finds once the directive
 * components of the deck are known.
 */
export function createDirectiveDiagnosticPlugin(): LanguageServicePlugin {
  return {
    name: 'seminar-directive-diagnostics',
    capabilities: {
      diagnosticProvider: {
        // They depend on the components that the Vite config registers, and
        // otherwise, Volar keeps them until the deck changes.
        interFileDependencies: true,
        workspaceDiagnostics: false,
      },
    },
    create(context) {
      return {
        provideDiagnostics(document) {
          const decoded = context.decodeEmbeddedDocumentUri(
            URI.parse(document.uri),
          );
          const code: CodeWithDirectiveProblems | undefined =
            decoded &&
            context.language.scripts
              .get(decoded[0])
              ?.generated?.embeddedCodes.get(decoded[1]);
          return code?.seminarDirectiveProblems?.map(
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
