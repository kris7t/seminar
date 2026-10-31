/** The grammar of decks in the editor. */
export const DECK_SCOPE = 'source.seminar-deck';

/** The third capture of a rule, which only includes `#markdown-string`. */
const PROPS_CAPTURE =
  /(<key>3<\/key>\s*<dict>\s*<key>patterns<\/key>\s*<array>\s*<dict>\s*<key>include<\/key>\s*<string>)#markdown-string(?=<\/string>)/g;

const FENCE = /<string>\(\?:\^\|\\G\)\[\\t \]\*\((?:`|~)\{3,\}\)/;

/**
 * Turns the grammar of MDX into the grammar of decks: gives it a scope of its
 * own, so that it works next to the MDX extension, and highlights the props
 * after the language of code fences, which injected rules can't tell from code.
 *
 * @throws If the grammar has no such code fences, e.g., after updating it.
 */
export function renderDeckGrammar(mdxGrammar: string): string {
  let fences = 0;
  const rendered = mdxGrammar
    .replaceAll('<string>source.mdx</string>', `<string>${DECK_SCOPE}</string>`)
    .replace(
      PROPS_CAPTURE,
      (match, start: string, offset: number, all: string) => {
        const begin = all.lastIndexOf('<key>begin</key>', offset);
        if (!FENCE.test(all.slice(begin, offset))) {
          return match;
        }
        fences += 1;
        return `${start}${DECK_SCOPE}.injection#code-fence-props`;
      },
    );
  if (fences === 0) {
    throw new Error('The grammar of MDX has no code fences to highlight.');
  }
  return rendered;
}
