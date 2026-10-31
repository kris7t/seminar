import { createMdxLanguagePlugin } from '@mdx-js/language-service';
import { deckSyntaxPlugins, findPackage } from '@seminar/mdx/syntax';
import type { LanguagePlugin, VirtualCode } from '@volar/language-server';
import remarkMath from 'remark-math';
import type { URI } from 'vscode-uri';

/** The language of decks in the editor. */
export const DECK_LANGUAGE = 'seminar-deck';

const MATH_PLUGIN = '@seminar/plugin-mathjax';

function pathOf(file: URI | string): string {
  return typeof file === 'string' ? file : file.fsPath;
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
 * JavaScript and Markdown documents with the language service of MDX.
 *
 * The syntax has to match the compiler. Reading the configs of decks would run
 * code of the workspace, so `$` starts math whenever the plugin that adds it
 * to the compiler is installed for the deck.
 */
export function createDeckLanguagePlugin(
  checkMdx = false,
  jsxImportSource = 'react',
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
      return code;
    },
  };
}
