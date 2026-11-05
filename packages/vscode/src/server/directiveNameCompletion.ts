import type {
  CompletionItem,
  LanguageServicePlugin,
  VirtualCode,
} from '@volar/language-server';
import type { Root } from 'mdast';
import { URI } from 'vscode-uri';

import type { DirectiveComponent } from './directiveLoader.ts';
import { completeDirectiveName } from './directiveNames.ts';

/**
 * The virtual code of a deck, with the components of its directives once
 * they're known.
 */
export type CodeWithDirectiveComponents = VirtualCode & {
  ast?: Root | undefined;
  seminarDirectiveComponents?:
    Readonly<Record<string, DirectiveComponent>> | undefined;
};

/** Kinds of completion items in the protocol. */
const KEYWORD = 14;
const CLASS = 7;

/** Snippets in the protocol. */
const SNIPPET = 2;

/** Requests that the user invoked in the protocol, e.g., with Ctrl+Space. */
const INVOKED = 1;

/**
 * Creates the plugin that completes the names of directives in decks, see
 * `completeDirectiveName`, with the components that the language plugin finds
 * for them once they're known.
 */
export function createDirectiveNamePlugin(): LanguageServicePlugin {
  return {
    name: 'seminar-directive-names',
    capabilities: {
      completionProvider: { triggerCharacters: [':'] },
    },
    create(context) {
      return {
        provideCompletionItems(document, position, completionContext) {
          const decoded = context.decodeEmbeddedDocumentUri(
            URI.parse(document.uri),
          );
          const code: CodeWithDirectiveComponents | undefined =
            decoded &&
            context.language.scripts
              .get(decoded[0])
              ?.generated?.embeddedCodes.get(decoded[1]);
          if (code?.ast === undefined) {
            return undefined;
          }
          const completion = completeDirectiveName(
            document.getText(),
            code.ast,
            document.offsetAt(position),
            code.seminarDirectiveComponents ?? {},
            completionContext.triggerKind === INVOKED,
          );
          if (completion === undefined) {
            return undefined;
          }
          const range = {
            start: document.positionAt(completion.start),
            end: document.positionAt(completion.end),
          };
          return {
            isIncomplete: false,
            items: completion.items.map((item): CompletionItem => ({
              label: item.name,
              kind: item.builtIn ? KEYWORD : CLASS,
              detail: item.detail,
              ...(item.documentation === undefined
                ? {}
                : {
                    documentation: {
                      kind: 'markdown',
                      value: item.documentation,
                    },
                  }),
              textEdit: { range, newText: item.insertText },
              insertTextFormat: SNIPPET,
            })),
          };
        },
      };
    },
  };
}
