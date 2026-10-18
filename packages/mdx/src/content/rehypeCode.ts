import type { Element, ElementContent, Root, RootContent } from 'hast';
import type { MdxJsxFlowElementHast } from 'mdast-util-mdx-jsx';
import path from 'node:path';
import type { VFile } from 'vfile';

import { getSliderConfigs } from '../config/remarkSliderConfig.ts';
import { importWithNode, type ModuleImporter } from '../config/themeConfig.ts';
import { createEsm, createStringAttribute } from '../utils/estree.ts';
import { EXPLICIT_JSX_HAST } from '../utils/jsx.ts';

/** A code block of a deck, fenced with three backticks. */
export interface CodeBlock {
  /** The text of the block. */
  code: string;
  /** The language of the block, e.g., `ts` for ` ```ts `. */
  lang: string | undefined;
  /** The rest of the first line of the block after the language. */
  meta: string | undefined;
}

/**
 * Highlights a code block when compiling a deck, with the merged `options`
 * of the `code` config of the plugins, the theme, and the frontmatter.
 *
 * @returns The element to render, e.g., a `pre` element with the
 *   highlighted code, or `undefined` to render the block as it is. Errors
 *   are reported as messages of the deck, which then renders the block as
 *   it is.
 */
export type CodeHighlighter = (
  block: CodeBlock,
  options: Record<string, unknown>,
) => Element | undefined | Promise<Element | undefined>;

export interface RehypeCodeOptions {
  /**
   * Imports the highlighter at compile time. Defaults to importing with
   * Node, which only supports JavaScript.
   */
  importModule?: ModuleImporter | undefined;
  /**
   * Called with the files that the compiled deck depends on, e.g., the
   * module of the highlighter, which should be watched for changes.
   */
  onDependency?: ((deckPath: string, dependency: string) => void) | undefined;
}

interface ModuleExport {
  source: string;
  exportName: string;
}

/** A module export, and where its source is resolved from. */
interface ResolvedExport extends ModuleExport {
  base: string;
}

interface CodeSetup {
  component?: ModuleExport | undefined;
  highlighter?: ResolvedExport | undefined;
  options: Record<string, unknown>;
}

/** Name that the deck imports the component of code blocks as. */
const CODE = '_SliderCode';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseExport(
  value: unknown,
  key: string,
  source: string,
  file: VFile,
): ModuleExport | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (
    !isRecord(value) ||
    typeof value['source'] !== 'string' ||
    value['source'] === '' ||
    typeof value['exportName'] !== 'string' ||
    value['exportName'] === ''
  ) {
    file.message(
      `Expected \`code.${key}\` in ${source} to have nonempty \`source\` and \`exportName\` strings`,
    );
    return undefined;
  }
  return { source: value['source'], exportName: value['exportName'] };
}

function parseOptions(
  value: unknown,
  source: string,
  file: VFile,
): Record<string, unknown> {
  if (value === undefined) {
    return {};
  }
  if (!isRecord(value)) {
    file.message(`Expected \`code.options\` in ${source} to be an object`);
    return {};
  }
  return value;
}

/**
 * Merges the `code` configs of the plugins and the theme, and the `code`
 * options of the frontmatter, in order of increasing precedence.
 */
function getCodeSetup(file: VFile): CodeSetup {
  const setup: CodeSetup = { options: {} };
  for (const { source, config, base } of getSliderConfigs(file) ?? []) {
    const code = isRecord(config) ? config['code'] : undefined;
    if (code === undefined) {
      continue;
    }
    const where = `the config of ${source}`;
    if (!isRecord(code)) {
      file.message(`Expected \`code\` in ${where} to be an object`);
      continue;
    }
    setup.component =
      parseExport(code['component'], 'component', where, file) ??
      setup.component;
    const highlighter = parseExport(
      code['highlighter'],
      'highlighter',
      where,
      file,
    );
    if (highlighter !== undefined) {
      setup.highlighter = { ...highlighter, base };
    }
    Object.assign(setup.options, parseOptions(code['options'], where, file));
  }
  const { sliderFrontmatter } = file.data as {
    sliderFrontmatter?: Record<string, unknown>;
  };
  Object.assign(
    setup.options,
    parseOptions(sliderFrontmatter?.['code'], 'the frontmatter', file),
  );
  return setup;
}

async function loadHighlighter(
  { source, exportName, base }: ResolvedExport,
  { importModule = importWithNode, onDependency }: RehypeCodeOptions,
  file: VFile,
): Promise<CodeHighlighter | undefined> {
  const deckPath = file.path || path.resolve('deck.mdx');
  try {
    const { module, dependencies = [] } = await importModule(source, base);
    for (const dependency of dependencies) {
      onDependency?.(deckPath, dependency);
    }
    const highlighter = module[exportName];
    if (typeof highlighter !== 'function') {
      file.message(
        `Expected ${source} to export the code highlighter \`${exportName}\``,
      );
      return undefined;
    }
    return highlighter as CodeHighlighter;
  } catch (error) {
    file.message(
      `Cannot load the code highlighter ${source}: ${String(error)}`,
    );
    return undefined;
  }
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

interface FoundBlock {
  parent: { children: (RootContent | ElementContent)[] };
  index: number;
  pre: Element;
  block: CodeBlock;
}

/** Finds the code blocks of Markdown: `pre` elements with a `code` element. */
function findBlocks(
  parent: { children: (RootContent | ElementContent)[] },
  found: FoundBlock[],
): void {
  parent.children.forEach((child, index) => {
    if (child.type === 'element' && child.tagName === 'pre') {
      const [code] = child.children;
      if (
        child.children.length === 1 &&
        code?.type === 'element' &&
        code.tagName === 'code' &&
        // Formulas of `remark-math`, which `rehypeMath` renders.
        !hasClass(code, 'math-display')
      ) {
        const { className } = code.properties;
        const language = Array.isArray(className)
          ? className.map(String).find((name) => name.startsWith('language-'))
          : undefined;
        const meta = (code.data as { meta?: string | null } | undefined)?.meta;
        found.push({
          parent,
          index,
          pre: child,
          block: {
            code: textOf(code).replace(/\n$/, ''),
            lang: language?.slice('language-'.length),
            meta: meta ?? undefined,
          },
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
 * Replaces the `found` code blocks with their `rendered` elements, or keeps
 * them, in the component of the config, if any.
 */
function renderBlocks(
  tree: Root,
  found: readonly FoundBlock[],
  setup: CodeSetup,
  rendered: ReadonlyMap<FoundBlock, Element>,
): void {
  for (const block of found) {
    const { parent, index, pre } = block;
    const element = rendered.get(block) ?? pre;
    if (setup.component === undefined) {
      parent.children[index] = element;
      continue;
    }
    const jsx: MdxJsxFlowElementHast = {
      type: 'mdxJsxFlowElement',
      name: CODE,
      attributes: [
        ...(block.block.lang === undefined
          ? []
          : [createStringAttribute('lang', block.block.lang)]),
        ...(block.block.meta === undefined
          ? []
          : [createStringAttribute('meta', block.block.meta)]),
        createStringAttribute('code', block.block.code),
      ],
      children: [element],
      data: EXPLICIT_JSX_HAST,
    };
    if (pre.position !== undefined) {
      jsx.position = pre.position;
    }
    parent.children[index] = jsx;
  }
  if (setup.component !== undefined) {
    tree.children.unshift(
      createEsm(
        `import { ${setup.component.exportName} as ${CODE} } from ${JSON.stringify(setup.component.source)};`,
      ),
    );
  }
}

/**
 * Renders the code blocks of a deck as the `code` config of the plugins and
 * the theme says (see `CodeConfig` in `@slider/core`): highlighted by its
 * highlighter when compiling the deck, and rendered by its component.
 * Without a config, code blocks stay `pre` elements.
 *
 * Must run after `remarkSliderConfig`, which loads the configs, and
 * `remarkSlides`, which puts the whole deck below one root.
 */
export function rehypeCode(
  options: RehypeCodeOptions = {},
): (tree: Root, file: VFile) => Promise<void> | undefined {
  return (tree, file) => {
    const found: FoundBlock[] = [];
    findBlocks(tree, found);
    if (found.length === 0) {
      return undefined;
    }
    const setup = getCodeSetup(file);
    const { highlighter } = setup;
    if (highlighter === undefined) {
      // Synchronous, so that decks without highlighting compile with
      // `compileSync`.
      renderBlocks(tree, found, setup, new Map());
      return undefined;
    }
    return (async () => {
      const highlight = await loadHighlighter(highlighter, options, file);
      const rendered = new Map<FoundBlock, Element>();
      for (const entry of found) {
        if (highlight === undefined) {
          break;
        }
        try {
          const element = await highlight(entry.block, setup.options);
          if (element !== undefined) {
            rendered.set(entry, element);
          }
        } catch (error) {
          file.message(`Cannot highlight code: ${String(error)}`, {
            place: entry.pre.position,
          });
        }
      }
      renderBlocks(tree, found, setup, rendered);
    })();
  };
}
