import type {
  LanguageServicePlugin,
  SemanticToken,
  VirtualCode,
} from '@volar/language-server';
import type { Root } from 'mdast';
import type ts from 'typescript';
import { URI } from 'vscode-uri';

import { findStepBehaviors } from './stepBehaviors.ts';
import { findBareProps } from './stepProps.ts';

/** The semantic token of step behaviors, see `package.json` for its colors. */
export const STEP_BEHAVIOR_TOKEN = 'seminarStepBehavior';

/**
 * Creates the plugin that marks the bare words in the props of a deck that are
 * step behaviors, which the grammar can't tell, since themes can add them.
 */
export function createStepBehaviorPlugin(
  typescript: typeof ts,
): LanguageServicePlugin {
  return {
    name: 'seminar-step-behaviors',
    capabilities: {
      semanticTokensProvider: {
        legend: { tokenTypes: [STEP_BEHAVIOR_TOKEN], tokenModifiers: [] },
      },
    },
    create(context) {
      return {
        provideDocumentSemanticTokens(document, range, legend) {
          const decoded = context.decodeEmbeddedDocumentUri(
            URI.parse(document.uri),
          );
          const code: (VirtualCode & { ast?: Root }) | undefined =
            decoded &&
            context.language.scripts
              .get(decoded[0])
              ?.generated?.embeddedCodes.get(decoded[1]);
          if (decoded === undefined || code?.ast === undefined) {
            return undefined;
          }
          const behaviors = findStepBehaviors(
            typescript,
            context
              .inject<{
                'typescript/languageService': () => ts.LanguageService;
              }>('typescript/languageService')
              ?.getProgram(),
            decoded[0].fsPath,
          );
          const type = legend.tokenTypes.indexOf(STEP_BEHAVIOR_TOKEN);
          const start = document.offsetAt(range.start);
          const end = document.offsetAt(range.end);
          return findBareProps(document.getText(), code.ast)
            .filter(
              ({ word, offset }) =>
                behaviors.has(word) && offset >= start && offset < end,
            )
            .map(({ word, offset }): SemanticToken => {
              const { line, character } = document.positionAt(offset);
              return [line, character, word.length, type, 0];
            });
        },
      };
    },
  };
}
