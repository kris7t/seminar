import type { Element, ElementContent, Root, RootContent } from 'hast';
import { fromHtml } from 'hast-util-from-html';
import { toHtml } from 'hast-util-to-html';
import type {
  MdxJsxAttribute,
  MdxJsxFlowElementHast,
  MdxJsxTextElementHast,
} from 'mdast-util-mdx-jsx';
import type { VFile } from 'vfile';

import {
  createEsm,
  createStringAttribute,
  EXPLICIT_JSX_HAST,
  getSliderOptionLayers,
} from '@slider/mdx';

import {
  createMathRenderer,
  DEFAULT_FONT,
  type MathOptions,
  type MathRenderer,
} from './mathjax.ts';

/** Name that decks import the `Formula` component as. */
const FORMULA = '_SliderMathFormula';

/**
 * Options for rendering math, which the `math` options of the Slider configs
 * and the `math` key of the frontmatter set.
 */
export interface MathConfig {
  /**
   * MathJax font to render math with, e.g., `newcm` for New Computer Modern
   * of the `@mathjax/mathjax-newcm-font` package, or the name of a MathJax
   * font package. Defaults to `fira`, which this plugin depends on. Font
   * packages are found from the config or the deck that sets the font.
   */
  font?: string | undefined;
  /**
   * TeX macros, e.g., `{ R: '\\mathbb{R}', norm: ['\\lVert #1 \\rVert', 1] }`,
   * which are merged.
   */
  macros?: Record<string, string | [string, number]> | undefined;
  /**
   * Which equations are numbered: `ams` numbers the environments that are
   * numbered in LaTeX with `amsmath`, like `equation`. Defaults to `ams`.
   */
  tags?: 'none' | 'ams' | 'all' | undefined;
}

interface MathNode {
  parent: { children: (RootContent | ElementContent)[] };
  index: number;
  source: string;
  display: boolean;
  node: Element;
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

/**
 * Finds the formulas created by `remark-math`: `code.math-inline` for inline
 * math and `pre > code.math-display` for display math.
 */
function findMath(
  parent: { children: (RootContent | ElementContent)[] },
  found: MathNode[],
) {
  for (const [index, child] of parent.children.entries()) {
    if (child.type !== 'element') {
      if ('children' in child) {
        findMath(child, found);
      }
      continue;
    }
    if (child.tagName === 'code' && hasClass(child, 'math-inline')) {
      found.push({
        parent,
        index,
        source: textOf(child),
        display: false,
        node: child,
      });
    } else if (
      child.tagName === 'pre' &&
      child.children.some(
        (code) =>
          code.type === 'element' &&
          code.tagName === 'code' &&
          hasClass(code, 'math-display'),
      )
    ) {
      found.push({
        parent,
        index,
        source: textOf(child),
        display: true,
        node: child,
      });
    } else {
      findMath(child, found);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMacro(value: unknown): value is string | [string, number] {
  return (
    typeof value === 'string' ||
    (Array.isArray(value) &&
      value.length === 2 &&
      typeof value[0] === 'string' &&
      typeof value[1] === 'number')
  );
}

/**
 * Validates math options given by `source`, reporting invalid ones.
 */
function parseMathConfig(
  value: unknown,
  source: string,
  file: VFile,
): MathConfig {
  if (value === undefined || value === null) {
    return {};
  }
  if (!isRecord(value)) {
    file.message(`Expected ${source} to be a mapping`);
    return {};
  }
  const config: MathConfig = {};
  const { font, macros, tags } = value;
  if (typeof font === 'string') {
    config.font = font;
  } else if (font !== undefined) {
    file.message(`Expected \`font\` of ${source} to be a string`);
  }
  if (isRecord(macros)) {
    config.macros = {};
    for (const [name, macro] of Object.entries(macros)) {
      if (isMacro(macro)) {
        config.macros[name] = macro;
      } else {
        file.message(
          `Expected the macro \`${name}\` in ${source} to be a string or a [definition, arguments] pair`,
        );
      }
    }
  } else if (macros !== undefined) {
    file.message(`Expected \`macros\` of ${source} to be a mapping`);
  }
  if (tags === 'none' || tags === 'ams' || tags === 'all') {
    config.tags = tags;
  } else if (tags !== undefined) {
    file.message(
      `Expected \`tags\` of ${source} to be \`none\`, \`ams\`, or \`all\``,
    );
  }
  return config;
}

function mergeConfigs(configs: MathConfig[]): MathOptions {
  const options: MathOptions = { font: DEFAULT_FONT, macros: {}, tags: 'ams' };
  for (const { font, macros, tags } of configs) {
    options.font = font ?? options.font;
    options.macros = { ...options.macros, ...macros };
    options.tags = tags ?? options.tags;
  }
  return options;
}

/** Removes attributes that MathJax only needs for interactive features. */
function cleanSvg(node: ElementContent): ElementContent[] {
  if (node.type !== 'element') {
    return [node];
  }
  const children = node.children.flatMap(cleanSvg);
  // Links of `\eqref` would navigate away from the slide.
  if (node.tagName === 'a') {
    return children;
  }
  const properties = { ...node.properties };
  delete properties['dataLatex'];
  delete properties['dataMmlNode'];
  delete properties['dataC'];
  return [{ ...node, properties, children }];
}

function cleanMathml(node: ElementContent, root: boolean): ElementContent {
  if (node.type !== 'element') {
    return node;
  }
  const properties = { ...node.properties };
  delete properties.href;
  if (!root) {
    // Only keep the TeX source of the whole formula as an annotation.
    delete properties['dataLatex'];
  }
  return {
    ...node,
    properties,
    children: node.children.map((child) => cleanMathml(child, false)),
  };
}

/**
 * Serializes MathML to HTML with non-ASCII characters as character references,
 * e.g., `&#x3C0;` for `π`. Self-contained builds only keep fonts for the
 * characters that occur literally in the page, and the MathML is only read by
 * assistive technology, which doesn't need fonts.
 */
function serializeMathml(math: ElementContent): string {
  return toHtml(math).replaceAll(
    /[\u0080-\u{10FFFF}]/gu,
    (character) =>
      `&#x${(character.codePointAt(0) ?? 0).toString(16).toUpperCase()};`,
  );
}

function findElement(node: Element, tagName: string): Element | undefined {
  for (const child of node.children) {
    if (child.type === 'element') {
      if (child.tagName === tagName) {
        return child;
      }
      const found = findElement(child, tagName);
      if (found !== undefined) {
        return found;
      }
    }
  }
  return undefined;
}

/**
 * Converts the HTML of a MathJax container to a `Formula` element with the
 * SVG and the MathML of the formula.
 */
function createFormula(
  html: string,
  display: boolean,
): MdxJsxFlowElementHast | MdxJsxTextElementHast {
  const [container] = fromHtml(html, { fragment: true }).children;
  if (container?.type !== 'element') {
    throw new Error('Expected MathJax to render a container element');
  }
  const svg = findElement(container, 'svg');
  const math = findElement(container, 'math');
  const attributes: MdxJsxAttribute[] = [];
  if (display) {
    attributes.push({ type: 'mdxJsxAttribute', name: 'display', value: null });
  }
  if (container.properties.width === 'full') {
    attributes.push({
      type: 'mdxJsxAttribute',
      name: 'fullWidth',
      value: null,
    });
    const style = container.properties.style;
    const minWidth =
      typeof style === 'string'
        ? /min-width:\s*([^;]+)/.exec(style)?.[1]?.trim()
        : undefined;
    if (minWidth !== undefined) {
      attributes.push(createStringAttribute('minWidth', minWidth));
    }
  }
  if (math !== undefined) {
    attributes.push(
      createStringAttribute('mathml', serializeMathml(cleanMathml(math, true))),
    );
  }
  const children = svg === undefined ? [] : cleanSvg(svg);
  return {
    type: display ? 'mdxJsxFlowElement' : 'mdxJsxTextElement',
    name: FORMULA,
    attributes,
    children,
    data: EXPLICIT_JSX_HAST,
  };
}

async function createRenderer(file: VFile): Promise<MathRenderer | undefined> {
  const layers = getSliderOptionLayers(file, 'math');
  const configs = layers.map(({ options, source }) =>
    parseMathConfig(options, source, file),
  );
  // Fonts are found from the configs that set them, the latest first.
  const bases = layers.map(({ base }) => base).reverse();
  try {
    return await createMathRenderer(mergeConfigs(configs), bases);
  } catch (error) {
    file.fail(`Cannot render math: ${String(error)}`);
  }
}

/**
 * Renders the math of a deck, as parsed by `remark-math`, to `Formula`
 * elements of `@slider/plugin-mathjax`, with SVG, and MathML for assistive
 * technology, with MathJax.
 *
 * Takes the `math` options of the Slider configs and the frontmatter, in
 * order of increasing precedence, see {@link MathConfig}.
 *
 * All glyphs of the font are loaded before rendering, since MathJax would
 * otherwise restart formulas that need more glyphs, defining their labels
 * twice. TeX errors, like undefined macros, are reported as messages of the
 * file, and shown in red in the deck.
 */
export function rehypeMathJax(): (tree: Root, file: VFile) => Promise<void> {
  return async (tree, file) => {
    const found: MathNode[] = [];
    findMath(tree, found);
    if (found.length === 0) {
      return;
    }
    const render = await createRenderer(file);
    if (render === undefined) {
      return;
    }
    for (const { parent, index, source, display, node } of found) {
      const html = render(source, display, (message) => {
        file.message(`Cannot render math: ${message}`, {
          place: node.position,
        });
      });
      parent.children[index] = createFormula(html, display);
    }
    tree.children.unshift(
      createEsm(
        `import { Formula as ${FORMULA} } from "@slider/plugin-mathjax";`,
      ),
    );
  };
}
