import type { Root } from 'mdast';
import { toString } from 'mdast-util-to-string';
import remarkFrontmatter from 'remark-frontmatter';
import remarkMdx from 'remark-mdx';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { VFile } from 'vfile';
import { parse as parseYaml } from 'yaml';

import { splitTrailingAttributeBlock } from './attributes.ts';

function parseFrontmatter(value: string, file: VFile): Record<string, unknown> {
  const data: unknown = parseYaml(value);
  if (data === null || data === undefined) {
    return {};
  }
  if (typeof data !== 'object' || Array.isArray(data)) {
    file.message('Expected the frontmatter to be a YAML mapping');
    return {};
  }
  return data as Record<string, unknown>;
}

/** Returns the text of the first heading that starts a slide, if any. */
function getFirstHeading(tree: Root): string | undefined {
  for (const node of tree.children) {
    if (node.type === 'heading' && node.depth <= 2) {
      const text = toString(node);
      return splitTrailingAttributeBlock(text)?.[0] ?? text;
    }
  }
  return undefined;
}

/** Defaults for the frontmatter of decks. */
export interface DeckDefaults {
  /**
   * Module to import the theme of decks from, unless they set their own
   * `theme`. Without one, decks use the default theme of `@slider/core`.
   */
  defaultTheme?: string | undefined;
  /**
   * Whether decks have mouse navigation, unless they set `mouseNavigation`.
   * Defaults to `true`.
   */
  defaultMouseNavigation?: boolean | undefined;
}

/**
 * Returns the frontmatter of a deck (parsed with `remark-frontmatter`), with
 * defaults filled in:
 *
 * - `title` defaults to the text of the first heading.
 * - `mouseNavigation` defaults to `defaultMouseNavigation`, or `true`.
 * - `theme` defaults to `defaultTheme`, if given.
 */
export function getDeckFrontmatter(
  tree: Root,
  file: VFile,
  { defaultTheme, defaultMouseNavigation = true }: DeckDefaults = {},
): Record<string, unknown> {
  let frontmatter: Record<string, unknown> = {};
  for (const node of tree.children) {
    if (node.type === 'yaml') {
      frontmatter = parseFrontmatter(node.value, file);
      break;
    }
  }
  const title = getFirstHeading(tree);
  return {
    ...(title === undefined ? {} : { title }),
    mouseNavigation: defaultMouseNavigation,
    ...(defaultTheme === undefined ? {} : { theme: defaultTheme }),
    ...frontmatter,
  };
}

/**
 * Reads the frontmatter of a deck from its MDX source without compiling it,
 * e.g., to generate an HTML page for it. See {@link getDeckFrontmatter}.
 */
export function readDeckFrontmatter(
  source: string,
  path?: string,
): Record<string, unknown> {
  const file = new VFile(path === undefined ? source : { value: source, path });
  const tree = unified()
    .use(remarkParse)
    .use(remarkMdx)
    .use(remarkFrontmatter)
    .parse(file);
  return getDeckFrontmatter(tree, file);
}
