import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import type { CodeBlockHandlerFactory } from '@seminar/mdx';
import {
  createFormulaTypesetter,
  type FormulaTypesetter,
} from '@seminar/plugin-mathjax/compile';
import { detectType, parse, PeleError, render } from 'pele';
import type { VFile } from 'vfile';

import type { DiagramFormula } from './Diagram.tsx';
import { findSteps } from './steps/index.ts';

const require = createRequire(import.meta.url);

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

/**
 * Renders the Mermaid diagrams of decks, written in ` ```mermaid ` code blocks,
 * with the `Diagram` component of `@seminar/plugin-pele`, which renders them
 * with Pele in the browser. Decks only import the types of diagrams that they
 * use. Steps of the items of diagrams are found in their source (see
 * `findSteps`).
 *
 * Formulas in labels, like `$$x^2$$`, are typeset with MathJax, in the font
 * and with the macros of the math of the deck (see `@seminar/plugin-mathjax`).
 * Diagrams that Pele can't parse are reported, and left to the handler of the
 * other code blocks, e.g., for syntax highlighting.
 *
 * Registered for ` ```mermaid ` code blocks by the config of
 * `@seminar/plugin-pele`.
 */
export const peleCodeBlocks: CodeBlockHandlerFactory = ({ file }) => {
  let typesetter: Promise<FormulaTypesetter> | undefined;
  return async ({ code: source, place }) => {
    // The source starts on the line after the fence.
    const start = place?.start;
    try {
      parse(source);
    } catch (error) {
      file.message(`Cannot render diagram: ${String(error)}`, {
        place:
          error instanceof PeleError && start !== undefined && error.line > 0
            ? { line: start.line + error.line, column: error.column }
            : place,
      });
      return undefined;
    }
    const type = detectType(source);
    if (type === null) {
      return undefined;
    }
    const steps = findSteps(source, file, (message, line) => {
      file.message(message, {
        place:
          start === undefined
            ? place
            : { line: start.line + 1 + line, column: 1 },
      });
    });
    const formulas: Record<string, DiagramFormula> = {};
    for (const tex of formulasOf(source)) {
      typesetter ??= createFormulaTypesetter(file);
      const formula = (await typesetter)(tex, (message) => {
        file.message(`Cannot render math: ${message}`, { place });
      });
      if (formula !== undefined) {
        formulas[tex] = formula;
      }
    }
    return {
      props: {
        source,
        ...(steps.length === 0 ? {} : { steps }),
        ...(Object.keys(formulas).length === 0 ? {} : { formulas }),
      },
      imports: {
        diagram: {
          source: diagramSpecifier(type, file),
          exportName: 'default',
        },
      },
    };
  };
};
