import type {
  CompletionItem,
  LanguageServicePlugin,
  VirtualCode,
} from '@volar/language-server';
import type { Root } from 'mdast';
import type ts from 'typescript';
import { URI } from 'vscode-uri';

import { importedDocumentation } from './directiveDocumentation.ts';
import type { DirectiveComponent } from './directiveLoader.ts';
import { completeDirectiveName } from './directiveNames.ts';
import { directivesFileName } from './language.ts';

/**
 * The virtual code of a deck, with the components of its directives once
 * they're known.
 */
export type CodeWithDirectiveComponents = VirtualCode & {
  ast?: Root | undefined;
  seminarDirectiveComponents?:
    Readonly<Record<string, DirectiveComponent>> | undefined;
  /**
   * The names that the code of the directives of the deck imports them as,
   * for their documentation, see `generateDirectiveCode`.
   */
  seminarDocumented?: Readonly<Record<string, string>> | undefined;
};

/** What completion items keep to resolve their documentation. */
interface ItemData {
  uri: string;
  name: string;
}

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
 * for them once they're known, and their documentation, which TypeScript
 * tells from the code of the directives of the deck.
 */
export function createDirectiveNamePlugin(
  typescript: typeof ts,
): LanguageServicePlugin {
  return {
    name: 'seminar-directive-names',
    capabilities: {
      completionProvider: { triggerCharacters: [':'], resolveProvider: true },
    },
    create(context) {
      const codeOf = (uri: string) => {
        const decoded = context.decodeEmbeddedDocumentUri(URI.parse(uri));
        const code: CodeWithDirectiveComponents | undefined =
          decoded &&
          context.language.scripts
            .get(decoded[0])
            ?.generated?.embeddedCodes.get(decoded[1]);
        return decoded && code && { script: decoded[0], code };
      };
      const documentationOf = ({ uri, name }: ItemData) => {
        const found = codeOf(uri);
        const local = found?.code.seminarDocumented?.[name];
        const program = context
          .inject<{
            'typescript/languageService': () => ts.LanguageService;
          }>('typescript/languageService')
          ?.getProgram();
        const fileName =
          found &&
          context.project.typescript?.uriConverter.asFileName(found.script);
        return local === undefined ||
          program === undefined ||
          fileName === undefined
          ? undefined
          : importedDocumentation(
              typescript,
              program,
              directivesFileName(fileName),
              local,
            );
      };
      return {
        provideCompletionItems(document, position, completionContext) {
          const code = codeOf(document.uri)?.code;
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
              textEdit: { range, newText: item.insertText },
              insertTextFormat: SNIPPET,
              data: { uri: document.uri, name: item.name } satisfies ItemData,
            })),
          };
        },
        resolveCompletionItem(item) {
          const documentation = documentationOf(item.data as ItemData);
          return documentation === undefined
            ? item
            : {
                ...item,
                documentation: { kind: 'markdown', value: documentation },
              };
        },
      };
    },
  };
}
