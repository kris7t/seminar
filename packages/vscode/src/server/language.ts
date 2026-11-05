import { createMdxLanguagePlugin } from '@mdx-js/language-service';
import { deckSyntaxPlugins, findPackage } from '@seminar/mdx/syntax';
import type { LanguagePlugin, VirtualCode } from '@volar/language-server';
import remarkMath from 'remark-math';
import type ts from 'typescript';
import type { URI } from 'vscode-uri';

import { generateDirectiveCode } from './directiveCode.ts';
import type { CodeWithDirectiveComponents } from './directiveNameCompletion.ts';
import type { DeckDirectiveComponents } from './directiveLoader.ts';
import type { CodeWithDirectiveProblems } from './directiveDiagnostics.ts';
import { findDirectiveProblems } from './directiveProblems.ts';

/** The language of decks in the editor. */
export const DECK_LANGUAGE = 'seminar-deck';

const MATH_PLUGIN = '@seminar/plugin-mathjax';

/** The id of the virtual code of the directives of a deck. */
export const DIRECTIVES = 'directives';

/** The name of the TypeScript file of the directives of the deck `fileName`. */
export function directivesFileName(fileName: string): string {
  return `${fileName}.directives.tsx`;
}

/**
 * Returns the components of the directives of the deck at `file` with
 * `source`, and the types of the attributes of its code blocks, if they are
 * known.
 */
export type DirectiveRegistry = (
  file: string,
  source: string,
) => Pick<DeckDirectiveComponents, 'directives' | 'codeBlocks'> | undefined;

/** What checks the directives of decks against the props of components. */
export interface DirectiveChecking {
  typescript: typeof ts;
  registry: DirectiveRegistry;
}

function pathOf(file: URI | string): string {
  return typeof file === 'string' ? file : file.fsPath;
}

function snapshotOf(text: string): VirtualCode['snapshot'] {
  return {
    getText: (start, end) => text.slice(start, end),
    getLength: () => text.length,
    getChangeRange: () => undefined,
  };
}

/**
 * Adds the virtual TypeScript of the directives of a deck to its `code`,
 * with those that have components once they're known, and then the components,
 * to complete their names, with the names that the code imports them as for
 * their documentation, and the problems with the directives.
 */
function addDirectives(
  code: (CodeWithDirectiveProblems & CodeWithDirectiveComponents) | undefined,
  file: string,
  source: string,
  directives: DirectiveRegistry,
) {
  if (code?.ast === undefined) {
    return;
  }
  // The directives of Seminar are checked before the components are known.
  const registry = directives(file, source);
  const { text, mappings, documented } = generateDirectiveCode(
    source,
    code.ast,
    registry?.directives ?? {},
    registry?.codeBlocks,
  );
  code.seminarDocumented = documented;
  if (registry !== undefined) {
    code.seminarDirectiveComponents = registry.directives;
    code.seminarDirectiveProblems = findDirectiveProblems(
      source,
      code.ast,
      registry.directives,
    );
  }
  code.embeddedCodes = [
    ...(code.embeddedCodes ?? []),
    {
      id: DIRECTIVES,
      languageId: 'typescriptreact',
      snapshot: snapshotOf(text),
      mappings,
    },
  ];
}

/**
 * Blanks the frontmatter in the virtual Markdown of a deck, which the language
 * service of MDX keeps, so that it doesn't show up as a heading in the outline.
 */
function blankFrontmatter(code: VirtualCode | undefined) {
  const markdown = code?.embeddedCodes?.find(({ id }) => id === 'md');
  if (markdown === undefined) {
    return;
  }
  const text = markdown.snapshot.getText(0, markdown.snapshot.getLength());
  const blanked = text.replace(
    /^---\r?\n(?:.*\r?\n)*?---[ \t]*$/m,
    (match, offset) => (offset === 0 ? match.replace(/[^\r\n]/g, ' ') : match),
  );
  markdown.snapshot = {
    getText: (start, end) => blanked.slice(start, end),
    getLength: () => blanked.length,
    getChangeRange: () => undefined,
  };
}

/**
 * Creates the language plugin of decks, which turns them into virtual
 * JavaScript and Markdown documents with the language service of MDX, and
 * the directives that have components into TypeScript, with `directives`.
 *
 * The syntax has to match the compiler. Reading the configs of decks would run
 * code of the workspace, so `$` starts math whenever the plugin that adds it
 * to the compiler is installed for the deck.
 */
export function createDeckLanguagePlugin(
  checkMdx = false,
  jsxImportSource = 'react',
  directives?: DirectiveChecking,
): LanguagePlugin<URI | string> {
  const create = (plugins: Parameters<typeof deckSyntaxPlugins>[0]) =>
    createMdxLanguagePlugin(
      deckSyntaxPlugins(plugins),
      [],
      checkMdx,
      jsxImportSource,
    );
  const plain = create([]);
  const withMath = create([remarkMath]);
  return {
    ...plain,
    getLanguageId: (file) =>
      pathOf(file).endsWith('.deck.mdx') ? DECK_LANGUAGE : undefined,
    createVirtualCode(file, languageId, snapshot, context) {
      if (languageId !== DECK_LANGUAGE) {
        return undefined;
      }
      const plugin =
        findPackage(MATH_PLUGIN, pathOf(file)) === undefined ? plain : withMath;
      const code = plugin.createVirtualCode?.(file, 'mdx', snapshot, context);
      blankFrontmatter(code);
      if (directives !== undefined) {
        addDirectives(
          code,
          pathOf(file),
          snapshot.getText(0, snapshot.getLength()),
          directives.registry,
        );
      }
      return code;
    },
    ...(plain.typescript && {
      typescript: {
        ...plain.typescript,
        getExtraServiceScripts(fileName, root) {
          const code = root.embeddedCodes?.find(({ id }) => id === DIRECTIVES);
          return code === undefined || directives === undefined
            ? []
            : [
                {
                  fileName: directivesFileName(fileName),
                  code,
                  extension: '.tsx',
                  scriptKind: directives.typescript.ScriptKind.TSX,
                },
              ];
        },
      },
    }),
  };
}
