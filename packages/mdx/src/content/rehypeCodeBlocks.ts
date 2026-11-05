import type { Element, ElementContent, Root, RootContent } from 'hast';
import type {
  MdxJsxAttribute,
  MdxJsxFlowElementHast,
} from 'mdast-util-mdx-jsx';
import type { VFile } from 'vfile';

import type {
  CodeBlock,
  CodeBlockHandler,
  CodeBlockResult,
  LoadedCodeBlock,
  ModuleExport,
} from '../config/codeBlocks.ts';
import { parseAttributeWords } from '../directives/attributeWords.ts';
import { getStepProps } from '../steps/remarkSteps.ts';
import {
  createEsm,
  createExpressionAttribute,
  createValueAttribute,
} from '../utils/estree.ts';
import { EXPLICIT_JSX_HAST } from '../utils/jsx.ts';

interface FoundBlock {
  parent: { children: (RootContent | ElementContent)[] };
  index: number;
  pre: Element;
  block: CodeBlock;
}

function hasClass(node: Element, name: string): boolean {
  const { className } = node.properties;
  return Array.isArray(className) && className.includes(name);
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
  found: FoundBlock[],
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
        const { attributes, rest } = parseAttributeWords(
          (code.data as { meta?: string | null } | undefined)?.meta ??
            undefined,
        );
        found.push({
          parent,
          index,
          pre: child,
          block: {
            lang: language?.slice('language-'.length),
            code: textOf(code).replace(/\n$/, ''),
            meta: rest,
            attributes,
            place: child.position,
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

/** Names the imports of a deck, once for each export. */
class Imports {
  readonly locals = new Map<string, { local: string; module: ModuleExport }>();

  /** Returns the name that the deck imports `module` as. */
  local(module: ModuleExport): string {
    const key = `${module.source}\0${module.exportName}`;
    let entry = this.locals.get(key);
    if (entry === undefined) {
      entry = { local: `_SeminarCode${String(this.locals.size)}`, module };
      this.locals.set(key, entry);
    }
    return entry.local;
  }
}

/** Returns a JSX attribute with a JSON value. */
function jsonAttribute(name: string, value: unknown): MdxJsxAttribute {
  return typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
    ? createValueAttribute(name, value)
    : // In parentheses, so that objects aren't read as blocks.
      createExpressionAttribute(name, `(${JSON.stringify(value)})`);
}

/** Creates the element of a code block rendered by `component`. */
function createElement(
  { pre, block }: FoundBlock,
  component: ModuleExport,
  { props = {}, imports = {}, children = [] }: CodeBlockResult,
  file: VFile,
  locals: Imports,
): MdxJsxFlowElementHast {
  const own = new Set([...Object.keys(props), ...Object.keys(imports)]);
  const stepProps = getStepProps(block.attributes, file).filter(([name]) => {
    if (!own.has(name)) {
      return true;
    }
    file.message(
      `Ignoring \`${name}\` on the code block, which its handler sets`,
      { place: block.place },
    );
    return false;
  });
  const element: MdxJsxFlowElementHast = {
    type: 'mdxJsxFlowElement',
    name: locals.local(component),
    attributes: [
      ...Object.entries(props)
        .filter(([, value]) => value !== undefined)
        .map(([name, value]) => jsonAttribute(name, value)),
      ...Object.entries(imports).map(([name, module]) =>
        createExpressionAttribute(name, locals.local(module)),
      ),
      // Like the attributes of `:step`, e.g., `#id .class step group=…`.
      ...stepProps.map(([name, value]) => createValueAttribute(name, value)),
    ],
    children,
    data: EXPLICIT_JSX_HAST,
  };
  if (pre.position !== undefined) {
    element.position = pre.position;
  }
  return element;
}

/** The props of the plain `CodeBlock` of `@seminar/core`. */
function defaultResult({ pre, block }: FoundBlock): CodeBlockResult {
  return {
    props: {
      ...(block.lang === undefined ? {} : { lang: block.lang }),
      ...(block.meta === undefined ? {} : { meta: block.meta }),
      code: block.code,
    },
    children: [pre],
  };
}

export interface RehypeCodeBlocksOptions {
  /**
   * The handlers of code blocks by their languages, or `*` for the rest, see
   * `loadDeckSetup`.
   */
  codeBlocks?: Readonly<Record<string, LoadedCodeBlock>> | undefined;
  /**
   * The module that the `CodeBlock` of blocks that no handler renders is
   * imported from. Defaults to `@seminar/core`.
   */
  importSource?: string | undefined;
}

/**
 * Renders the code blocks of decks with the components that the configs
 * register for their languages (see `CodeBlockHandlerFactory`), or with the
 * plain `CodeBlock` of `@seminar/core`.
 *
 * The handler of the language of a block renders it, or else the handler of
 * `*`, if they don't return `undefined`. The attributes after the language,
 * e.g., ` ```ts #fib step `, are passed to the component like those of
 * `:step`, unless the handler sets the same props. Display math of
 * `remark-math` isn't a code block.
 */
export function rehypeCodeBlocks({
  codeBlocks = {},
  importSource = '@seminar/core',
}: RehypeCodeBlocksOptions = {}): (
  tree: Root,
  file: VFile,
) => Promise<void> | undefined {
  return (tree, file) => {
    const found: FoundBlock[] = [];
    findBlocks(tree, found);
    if (found.length === 0) {
      return undefined;
    }
    const locals = new Imports();
    const finish = () => {
      tree.children.unshift(
        ...[...locals.locals.values()].map(({ local, module }) =>
          createEsm(
            `import { ${module.exportName} as ${local} } from ${JSON.stringify(module.source)};`,
          ),
        ),
      );
    };
    const renderDefault = (entry: FoundBlock) => {
      entry.parent.children[entry.index] = createElement(
        entry,
        { source: importSource, exportName: 'CodeBlock' },
        defaultResult(entry),
        file,
        locals,
      );
    };
    // Without handlers, e.g., in `compileSync`, it needn't be async.
    if (Object.keys(codeBlocks).length === 0) {
      found.forEach(renderDefault);
      finish();
      return undefined;
    }
    return (async () => {
      const handlers = new Map<LoadedCodeBlock, CodeBlockHandler>();
      const handlerOf = (registration: LoadedCodeBlock) => {
        let handler = handlers.get(registration);
        if (handler === undefined) {
          handler = registration.handler({ file });
          handlers.set(registration, handler);
        }
        return handler;
      };
      for (const entry of found) {
        const { block } = entry;
        const candidates = [
          block.lang !== undefined && Object.hasOwn(codeBlocks, block.lang)
            ? codeBlocks[block.lang]
            : undefined,
          Object.hasOwn(codeBlocks, '*') ? codeBlocks['*'] : undefined,
        ].filter(
          (candidate, index, all): candidate is LoadedCodeBlock =>
            candidate !== undefined && all.indexOf(candidate) === index,
        );
        let rendered = false;
        for (const registration of candidates) {
          let result: CodeBlockResult | undefined;
          try {
            result = await handlerOf(registration)(block);
          } catch (error) {
            file.message(`Cannot render the code block: ${String(error)}`, {
              place: block.place,
            });
          }
          if (result !== undefined) {
            entry.parent.children[entry.index] = createElement(
              entry,
              registration.component,
              result,
              file,
              locals,
            );
            rendered = true;
            break;
          }
        }
        if (!rendered) {
          renderDefault(entry);
        }
      }
      finish();
    })();
  };
}
