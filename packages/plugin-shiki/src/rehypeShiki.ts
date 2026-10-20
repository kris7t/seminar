import type { Element, ElementContent, Root, RootContent } from 'hast';
import type { MdxJsxFlowElementHast } from 'mdast-util-mdx-jsx';
import {
  createEsm,
  createStringAttribute,
  EXPLICIT_JSX_HAST,
  getStepProps,
  parseAttributeWords,
} from '@seminar/mdx';
import type { VFile } from 'vfile';

import { readCodeOptions } from './codeOptions.ts';
import { highlight } from './highlight.ts';

/** Name that decks import the {@link Code} component as. */
const CODE = '_SeminarShikiCode';

interface CodeBlock {
  parent: { children: (RootContent | ElementContent)[] };
  index: number;
  pre: Element;
  code: string;
  lang: string | undefined;
  /** The rest of the first line of the block. */
  meta: string | undefined;
}

function hasClass(node: Element, name: string): boolean {
  const { className } = node.properties;
  return Array.isArray(className) && className.some((value) => value === name);
}

function textOf(node: ElementContent): string {
  if (node.type === 'text') {
    return node.value;
  }
  return 'children' in node ? node.children.map(textOf).join('') : '';
}

/** Finds the code blocks of Markdown: `pre` elements with a `code` element. */
function findBlocks(
  parent: { children: (RootContent | ElementContent)[] },
  found: CodeBlock[],
): void {
  parent.children.forEach((child, index) => {
    if (child.type === 'element' && child.tagName === 'pre') {
      const [code] = child.children;
      if (
        child.children.length === 1 &&
        code?.type === 'element' &&
        code.tagName === 'code' &&
        // Formulas of `remark-math`.
        !hasClass(code, 'math-display')
      ) {
        const { className } = code.properties;
        const language = Array.isArray(className)
          ? className.map(String).find((name) => name.startsWith('language-'))
          : undefined;
        found.push({
          parent,
          index,
          pre: child,
          code: textOf(code).replace(/\n$/, ''),
          lang: language?.slice('language-'.length),
          meta:
            (code.data as { meta?: string | null } | undefined)?.meta ??
            undefined,
        });
        return;
      }
    }
    if ('children' in child) {
      findBlocks(child, found);
    }
  });
}

/**
 * Highlights the code blocks of decks with Shiki, and renders them with the
 * `Code` component of `@seminar/plugin-shiki`. Takes the `code` options of
 * the Seminar configs and the frontmatter (see {@link readCodeOptions}).
 *
 * The first line of a block takes the attributes of `:step` after the
 * language, e.g., ` ```ts #fib .wide step `, and passes the other words to
 * the component as `meta`. Blocks that can't be highlighted, e.g., in an
 * unknown language, are reported, and shown as plain text.
 *
 * Enabled by the `mdx` config of `@seminar/plugin-shiki`.
 */
export function rehypeShiki(): (tree: Root, file: VFile) => Promise<void> {
  return async (tree, file) => {
    const found: CodeBlock[] = [];
    findBlocks(tree, found);
    if (found.length === 0) {
      return;
    }
    const options = await readCodeOptions(file);
    for (const block of found) {
      let rendered: Element = block.pre;
      try {
        rendered = (await highlight(block, options)) ?? block.pre;
      } catch (error) {
        file.message(`Cannot highlight code: ${String(error)}`, {
          place: block.pre.position,
        });
      }
      const { attributes, rest } = parseAttributeWords(block.meta);
      const element: MdxJsxFlowElementHast = {
        type: 'mdxJsxFlowElement',
        name: CODE,
        attributes: [
          ...(block.lang === undefined
            ? []
            : [createStringAttribute('lang', block.lang)]),
          ...(rest === undefined ? [] : [createStringAttribute('meta', rest)]),
          createStringAttribute('code', block.code),
          // Like the attributes of `:step`, e.g., `#id .class step group=…`.
          ...getStepProps(attributes, file).map(([name, value]) =>
            createStringAttribute(name, value),
          ),
        ],
        children: [rendered],
        data: EXPLICIT_JSX_HAST,
      };
      if (block.pre.position !== undefined) {
        element.position = block.pre.position;
      }
      block.parent.children[block.index] = element;
    }
    tree.children.unshift(
      createEsm(`import { Code as ${CODE} } from "@seminar/plugin-shiki";`),
    );
  };
}
