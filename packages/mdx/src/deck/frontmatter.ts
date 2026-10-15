import type { Root } from 'mdast';
import { toString } from 'mdast-util-to-string';
import remarkDirective from 'remark-directive';
import remarkFrontmatter from 'remark-frontmatter';
import remarkMath from 'remark-math';
import remarkMdx from 'remark-mdx';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { VFile } from 'vfile';
import { parse as parseYaml } from 'yaml';

import { hasDirective } from '../directives/directives.ts';
import { remarkHeadingAttributes } from '../directives/remarkHeadingAttributes.ts';

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

/** The deepest heading level that starts slides. */
export const MAX_DEPTH = 4;

/**
 * Detects the depth of a deck: the deepest level of its headings, but at most
 * {@link MAX_DEPTH}.
 */
function detectDepth(tree: Root): number {
  let depth = 0;
  for (const node of tree.children) {
    if (node.type === 'heading') {
      depth = Math.max(depth, Math.min(node.depth, MAX_DEPTH));
    }
  }
  return depth;
}

function getDepth(
  frontmatter: Record<string, unknown>,
  tree: Root,
  file: VFile,
): number {
  const { depth } = frontmatter;
  if (depth === undefined) {
    return detectDepth(tree);
  }
  if (
    typeof depth === 'number' &&
    Number.isInteger(depth) &&
    depth >= 0 &&
    depth <= MAX_DEPTH
  ) {
    return depth;
  }
  file.message(
    `Expected \`depth\` in the frontmatter to be an integer from 0 to ${String(MAX_DEPTH)}`,
  );
  return detectDepth(tree);
}

/**
 * Returns the text of the first heading that starts a slide, or of the first
 * heading if no heading starts a slide.
 */
function getFirstHeading(tree: Root, depth: number): string | undefined {
  for (const node of tree.children) {
    if (
      node.type === 'heading' &&
      (depth === 0 ||
        node.depth <= depth ||
        hasDirective(node.children, 'slide'))
    ) {
      // Directives like `:slide{#id}` have no text.
      return toString(node).trim();
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
 * - `depth`, the deepest level of headings that start slides, defaults to the
 *   deepest level of the headings of the deck, but at most 4.
 * - `title` defaults to the text of the first heading that starts a slide.
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
  const depth = getDepth(frontmatter, tree, file);
  const title = getFirstHeading(tree, depth);
  return {
    ...(title === undefined ? {} : { title }),
    mouseNavigation: defaultMouseNavigation,
    ...(defaultTheme === undefined ? {} : { theme: defaultTheme }),
    ...frontmatter,
    depth,
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
  const { tree, file } = parseDeck(source, path);
  return getDeckFrontmatter(tree, file);
}

/**
 * Parses the MDX source of a deck without compiling it, e.g., to read its
 * frontmatter or the structure of its slides.
 */
export function parseDeck(
  source: string,
  path?: string,
): { tree: Root; file: VFile } {
  const file = new VFile(path === undefined ? source : { value: source, path });
  const tree = unified()
    .use(remarkParse)
    .use(remarkHeadingAttributes)
    .use(remarkMdx)
    .use(remarkFrontmatter)
    // Braces in math are not JavaScript expressions.
    .use(remarkMath)
    .use(remarkDirective)
    .parse(file);
  return { tree, file };
}
