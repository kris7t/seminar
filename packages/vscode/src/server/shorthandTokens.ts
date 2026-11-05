import type { BuiltInStepBehavior } from '@seminar/core';
import type {
  LanguageServicePlugin,
  SemanticToken,
  VirtualCode,
} from '@volar/language-server';
import type { Root } from 'mdast';
import type ts from 'typescript';
import { URI } from 'vscode-uri';

import { DIRECTIVES, directivesFileName } from './language.ts';
import {
  findOverrideShorthands,
  type ShorthandKind,
} from './overrideShorthands.ts';
import { findBareProps } from './stepProps.ts';

/** The semantic token of step behaviors, see `package.json` for its colors. */
export const STEP_BEHAVIOR_TOKEN = 'seminarStepBehavior';

/** The semantic token of slide masters, see `package.json` for its colors. */
export const SLIDE_MASTER_TOKEN = 'seminarSlideMaster';

const TOKENS: Record<ShorthandKind, string> = {
  behavior: STEP_BEHAVIOR_TOKEN,
  master: SLIDE_MASTER_TOKEN,
};

const BUILT_IN_BEHAVIORS: Record<BuiltInStepBehavior, true> = {
  reveal: true,
  dim: true,
  preview: true,
  focus: true,
  only: true,
  scoped: true,
  insert: true,
  expand: true,
  swap: true,
  always: true,
};

/**
 * The built-in slide masters that have shorthands, see
 * `SlideMasterShorthands`, where `title` is the title of the slide instead.
 */
const BUILT_IN_MASTERS: ReadonlySet<string> = new Set([
  'content',
  'section',
  'subsection',
]);

/** Returns what the bare word of a deck is a shorthand for, by its name. */
function builtInKind(word: string, slide: boolean): ShorthandKind | undefined {
  if (slide) {
    return BUILT_IN_MASTERS.has(word) ? 'master' : undefined;
  }
  return Object.hasOwn(BUILT_IN_BEHAVIORS, word) ? 'behavior' : undefined;
}

/**
 * Creates the plugin that marks the bare words in the props of a deck that are
 * step behaviors, and those in the attributes of slides that are masters.
 *
 * The built-in ones are marked by their names wherever they're written. Those
 * that themes add by augmenting `StepBehaviorOverrides` or
 * `SlideMasterOverrides` are only marked where the props they're written in
 * have them, as TypeScript tells from the code of the directives of the deck,
 * and not, e.g., on components that aren't steps.
 */
export function createShorthandTokenPlugin(
  typescript: typeof ts,
): LanguageServicePlugin {
  return {
    name: 'seminar-shorthands',
    capabilities: {
      semanticTokensProvider: {
        legend: {
          tokenTypes: [STEP_BEHAVIOR_TOKEN, SLIDE_MASTER_TOKEN],
          tokenModifiers: [],
        },
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
          if (decoded === undefined || code === undefined) {
            return undefined;
          }
          const start = document.offsetAt(range.start);
          const end = document.offsetAt(range.end);
          const token = (
            offset: number,
            length: number,
            kind: ShorthandKind,
          ): SemanticToken => {
            const { line, character } = document.positionAt(offset);
            return [
              line,
              character,
              length,
              legend.tokenTypes.indexOf(TOKENS[kind]),
              0,
            ];
          };
          if (code.ast !== undefined) {
            return findBareProps(document.getText(), code.ast).flatMap(
              ({ word, offset, slide }) => {
                const kind = builtInKind(word, slide);
                return kind !== undefined && offset >= start && offset < end
                  ? [token(offset, word.length, kind)]
                  : [];
              },
            );
          }
          const program = context
            .inject<{
              'typescript/languageService': () => ts.LanguageService;
            }>('typescript/languageService')
            ?.getProgram();
          const fileName = context.project.typescript?.uriConverter.asFileName(
            decoded[0],
          );
          if (
            code.id !== DIRECTIVES ||
            program === undefined ||
            fileName === undefined
          ) {
            return undefined;
          }
          return findOverrideShorthands(
            typescript,
            program,
            directivesFileName(fileName),
          ).flatMap((shorthand) =>
            shorthand.start >= start && shorthand.start < end
              ? [
                  token(
                    shorthand.start,
                    shorthand.end - shorthand.start,
                    shorthand.kind,
                  ),
                ]
              : [],
          );
        },
      };
    },
  };
}
