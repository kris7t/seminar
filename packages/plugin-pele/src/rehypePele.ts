import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import type { Element, ElementContent, Root, RootContent } from 'hast';
import type { MdxJsxFlowElementHast } from 'mdast-util-mdx-jsx';
import {
  createFormulaTypesetter,
  type FormulaTypesetter,
} from '@seminar/plugin-mathjax/compile';
import { detectType, parse, PeleError, render } from 'pele';
import type { VFile } from 'vfile';

import {
  createEsm,
  createExpressionAttribute,
  createStringAttribute,
  EXPLICIT_JSX_HAST,
  getStepProps,
  parseAttributeWords,
} from '@seminar/mdx';

import type { DiagramFormula } from './Diagram.tsx';
import { findSteps } from './steps/index.ts';

/** Name that decks import the {@link Diagram} component as. */
const DIAGRAM = '_SeminarPeleDiagram';

const require = createRequire(import.meta.url);

interface DiagramBlock {
  parent: { children: (RootContent | ElementContent)[] };
  index: number;
  pre: Element;
  source: string;
  /** The rest of the first line of the block. */
  meta: string | undefined;
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

/** Finds the code blocks of Mermaid diagrams, i.e., ` ```mermaid `. */
function findBlocks(
  parent: { children: (RootContent | ElementContent)[] },
  found: DiagramBlock[],
): void {
  parent.children.forEach((child, index) => {
    if (child.type === 'element' && child.tagName === 'pre') {
      const [code] = child.children;
      if (
        child.children.length === 1 &&
        code?.type === 'element' &&
        code.tagName === 'code' &&
        hasClass(code, 'language-mermaid')
      ) {
        found.push({
          parent,
          index,
          pre: child,
          source: textOf(code).replace(/\n$/, ''),
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
 * Returns the module specifier of the diagram type `type` of Pele for the deck
 * of `file`: by the name of the package if the deck finds the same package, so
 * that bundlers handle it like other packages, otherwise by its absolute path.
 */
function diagramSpecifier(type: string, file: VFile): string {
  const specifier = `pele/diagrams/${type}`;
  const own = path.dirname(require.resolve('pele/package.json'));
  let directory = file.path === '' ? undefined : path.dirname(file.path);
  while (directory !== undefined) {
    const candidate = path.join(directory, 'node_modules', 'pele');
    if (existsSync(path.join(candidate, 'package.json'))) {
      return path.resolve(candidate) === path.resolve(own)
        ? specifier
        : require.resolve(specifier).split(path.sep).join('/');
    }
    const parent = path.dirname(directory);
    directory = parent === directory ? undefined : parent;
  }
  return require.resolve(specifier).split(path.sep).join('/');
}

/** Returns the TeX of the formulas in the labels of a diagram, like `$$x$$`. */
function formulasOf(source: string): Set<string> {
  const formulas = new Set<string>();
  if (source.includes('$$')) {
    render(source, {
      math: (tex) => {
        formulas.add(tex);
        return { svg: '<svg></svg>', width: 1, height: 1 };
      },
    });
  }
  return formulas;
}

/** Returns the name that decks import the diagram type `type` as. */
function diagramName(type: string): string {
  return `_SeminarPele_${type}`;
}

/**
 * Renders the Mermaid diagrams of decks, written in ` ```mermaid ` code blocks,
 * with the `Diagram` component of `@seminar/plugin-pele`, which renders them
 * with Pele in the browser. Decks only import the types of diagrams that they
 * use.
 *
 * The first line of a block takes the attributes of `:step` after the
 * language, e.g., ` ```mermaid #pipeline step `, and its `id` names the
 * diagram on the slide, e.g., for callouts. Diagrams that Pele can't parse
 * are reported, and left as code blocks.
 *
 * Formulas in labels, like `$$x^2$$`, are typeset with MathJax, in the font
 * and with the macros of the math of the deck (see `@seminar/plugin-mathjax`).
 *
 * Runs before other plugins of the compiler, e.g., syntax highlighting, which
 * would take the diagrams for code. Enabled by the `mdx` config of
 * `@seminar/plugin-pele`.
 */
export function rehypePele(): (tree: Root, file: VFile) => Promise<void> {
  return async (tree, file) => {
    const found: DiagramBlock[] = [];
    findBlocks(tree, found);
    const types = new Set<string>();
    let typesetter: Promise<FormulaTypesetter> | undefined;
    for (const block of found) {
      const type = detectType(block.source);
      // The source starts on the line after the fence.
      const start = block.pre.position?.start;
      try {
        parse(block.source);
      } catch (error) {
        file.message(`Cannot render diagram: ${String(error)}`, {
          place:
            error instanceof PeleError && start !== undefined && error.line > 0
              ? { line: start.line + error.line, column: error.column }
              : block.pre.position,
        });
        continue;
      }
      if (type === null) {
        continue;
      }
      types.add(type);
      const { attributes } = parseAttributeWords(block.meta);
      const steps = findSteps(block.source, file, (message, line) => {
        file.message(message, {
          place:
            start === undefined
              ? block.pre.position
              : { line: start.line + 1 + line, column: 1 },
        });
      });
      const formulas: Record<string, DiagramFormula> = {};
      for (const tex of formulasOf(block.source)) {
        typesetter ??= createFormulaTypesetter(file);
        const formula = (await typesetter)(tex, (message) => {
          file.message(`Cannot render math: ${message}`, {
            place: block.pre.position,
          });
        });
        if (formula !== undefined) {
          formulas[tex] = formula;
        }
      }
      const element: MdxJsxFlowElementHast = {
        type: 'mdxJsxFlowElement',
        name: DIAGRAM,
        attributes: [
          createStringAttribute('source', block.source),
          createExpressionAttribute('diagrams', `[${diagramName(type)}]`),
          ...(steps.length === 0
            ? []
            : [createExpressionAttribute('steps', JSON.stringify(steps))]),
          ...(Object.keys(formulas).length === 0
            ? []
            : [
                createExpressionAttribute(
                  'formulas',
                  `(${JSON.stringify(formulas)})`,
                ),
              ]),
          // Like the attributes of `:step`, e.g., `#id .class step group=…`.
          ...getStepProps(attributes, file).map(([name, value]) =>
            createStringAttribute(name, value),
          ),
        ],
        children: [],
        data: EXPLICIT_JSX_HAST,
      };
      if (block.pre.position !== undefined) {
        element.position = block.pre.position;
      }
      block.parent.children[block.index] = element;
    }
    if (types.size === 0) {
      return;
    }
    tree.children.unshift(
      createEsm(
        `import { Diagram as ${DIAGRAM} } from "@seminar/plugin-pele";`,
      ),
      ...[...types].map((type) =>
        createEsm(
          `import ${diagramName(type)} from ${JSON.stringify(diagramSpecifier(type, file))};`,
        ),
      ),
    );
  };
}
