import path from 'node:path';

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
  setRuntimeSliderOptions,
} from '@slider/mdx';

import { readMathOptions, type DeckMathOptions } from './mathConfig.ts';
import {
  createMathRenderer,
  findFontPackage,
  getFontPackage,
  listDynamicFiles,
  type MathRenderer,
} from './mathjax.ts';
import { findPackage } from './packages.ts';

/** Name that decks import the `Formula` component as. */
const FORMULA = '_SliderMathFormula';

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

async function createRenderer(
  options: DeckMathOptions,
  file: VFile,
): Promise<MathRenderer | undefined> {
  try {
    return await createMathRenderer(options, options.bases);
  } catch (error) {
    file.fail(`Cannot render math: ${String(error)}`);
  }
}

/**
 * Returns a function that turns paths in the font package in `directory` to
 * module specifiers for the deck: by the name of the package if the deck
 * finds the same package, so that bundlers handle it like other packages,
 * otherwise by their absolute paths.
 */
function fontSpecifiers(
  font: string,
  directory: string,
  file: VFile,
): (...segments: string[]) => string {
  const name = getFontPackage(font);
  const fromDeck = file.path === '' ? undefined : findPackage(name, file.path);
  return (...segments) =>
    JSON.stringify(
      fromDeck !== undefined &&
        path.resolve(fromDeck) === path.resolve(directory)
        ? [name, ...segments].join('/')
        : path
            .join(directory, ...segments)
            .split(path.sep)
            .join('/'),
    );
}

/**
 * Returns the code of the `math` options of the deck in the browser, for
 * `DynamicFormula`s, with the font of the deck if they're enabled, see
 * `RuntimeMathOptions`.
 */
async function createRuntimeOptions(
  options: DeckMathOptions,
  file: VFile,
): Promise<string> {
  const { font, macros, tags, dynamic } = options;
  let fontCode = 'undefined';
  if (dynamic !== undefined) {
    const directory = findFontPackage(font, options.bases);
    const specifier = fontSpecifiers(font, directory, file);
    const available = await listDynamicFiles(directory);
    let files = available;
    if (dynamic.glyphs !== undefined) {
      const names = available.map((name) => name.replace(/\.js$/, ''));
      for (const glyph of dynamic.glyphs) {
        if (!names.includes(glyph)) {
          file.message(
            `The font ${font} has no glyphs \`${glyph}\` for dynamic math, only ${names.map((name) => `\`${name}\``).join(', ')}`,
          );
        }
      }
      files = available.filter((name) =>
        dynamic.glyphs?.includes(name.replace(/\.js$/, '')),
      );
    }
    const loaders = files.map(
      (name) =>
        `${JSON.stringify(name)}: () => import(${specifier('mjs', 'svg', 'dynamic', name)})`,
    );
    fontCode = `{ loadRenderer: () => import("@slider/plugin-mathjax/render"), font: _sliderDefineMathFont(() => import(${specifier('mjs', 'svg.js')}), {${loaders.join(', ')}}) }`;
  }
  return `{ font: ${JSON.stringify(font)}, macros: ${JSON.stringify(macros)}, tags: ${JSON.stringify(tags)}, dynamic: ${fontCode} }`;
}

/**
 * Renders the math of a deck, as parsed by `remark-math`, to `Formula`
 * elements of `@slider/plugin-mathjax`, with SVG, and MathML for assistive
 * technology, with MathJax.
 *
 * Takes the `math` options of the Slider configs and the frontmatter, in
 * order of increasing precedence, see {@link MathConfig}, and sets them for
 * the `DynamicFormula`s of the deck in the browser.
 *
 * All glyphs of the font are loaded before rendering, since MathJax would
 * otherwise restart formulas that need more glyphs, defining their labels
 * twice. TeX errors, like undefined macros, are reported as messages of the
 * file, and shown in red in the deck.
 */
export function rehypeMathJax(): (tree: Root, file: VFile) => Promise<void> {
  return async (tree, file) => {
    const options = readMathOptions(file);
    try {
      setRuntimeSliderOptions(
        file,
        'math',
        await createRuntimeOptions(options, file),
      );
      if (options.dynamic !== undefined) {
        tree.children.unshift(
          createEsm(
            'import { defineMathFont as _sliderDefineMathFont } from "@slider/plugin-mathjax";',
          ),
        );
      }
    } catch (error) {
      file.fail(`Cannot set up dynamic math: ${String(error)}`);
    }
    const found: MathNode[] = [];
    findMath(tree, found);
    if (found.length === 0) {
      return;
    }
    const render = await createRenderer(options, file);
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
