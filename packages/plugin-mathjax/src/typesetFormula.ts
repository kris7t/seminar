import type { Element } from 'hast';
import { fromHtml } from 'hast-util-from-html';
import { toHtml } from 'hast-util-to-html';
import type { VFile } from 'vfile';

import { readMathOptions } from './mathConfig.ts';
import { createMathRenderer } from './mathjax.ts';
import { cleanSvg, findElement } from './rehypeMathJax.ts';

/** An inline formula typeset as SVG, see {@link createFormulaTypesetter}. */
export interface TypesetFormula {
  /** The SVG of the formula, which fills the box that it's put in. */
  svg: string;
  /** The width of the formula, in ems of the text around it. */
  width: number;
  /** The height of the formula, in ems of the text around it. */
  height: number;
}

/** Typesets the TeX of an inline formula, reporting TeX errors to `onError`. */
export type FormulaTypesetter = (
  tex: string,
  onError: (message: string) => void,
) => TypesetFormula | undefined;

/**
 * Creates a function that typesets inline formulas with the `math` options of
 * the deck of `file`, like the math of the deck, e.g., for the labels of
 * diagrams, which put the formulas into boxes of their size. The SVG keeps
 * its glyphs in its paths, so that it has no ids.
 */
export async function createFormulaTypesetter(
  file: VFile,
): Promise<FormulaTypesetter> {
  const options = readMathOptions(file);
  const render = await createMathRenderer(options, options.bases, {
    fontCache: 'none',
  });
  return (tex, onError) => {
    const [container] = fromHtml(render(tex, false, onError), {
      fragment: true,
    }).children;
    const svg =
      container?.type === 'element' ? findElement(container, 'svg') : undefined;
    // In thousandths of ems, e.g., `0 -716 2009 716`.
    const viewBox = svg?.properties.viewBox;
    const box =
      typeof viewBox === 'string' ? viewBox.split(/\s+/).map(Number) : [];
    const [, , width, height] = box;
    if (svg === undefined || width === undefined || height === undefined) {
      return undefined;
    }
    const [cleaned] = cleanSvg(svg);
    const properties = { ...(cleaned as Element).properties };
    delete properties.style;
    return {
      svg: toHtml({
        ...(cleaned as Element),
        properties: { ...properties, width: '100%', height: '100%' },
      }),
      width: width / 1000,
      height: height / 1000,
    };
  };
}
