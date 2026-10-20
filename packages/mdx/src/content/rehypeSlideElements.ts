import type { ElementContent, Root, RootContent } from 'hast';
import type {
  MdxJsxFlowElementHast,
  MdxJsxTextElementHast,
} from 'mdast-util-mdx-jsx';
import type { Position } from 'unist';
import type { VFile } from 'vfile';

import {
  createExpressionAttribute,
  createStringAttribute,
} from '../utils/estree.ts';
import { SLIDE, SLIDE_ELEMENT } from '../utils/jsx.ts';

type JsxElement = MdxJsxFlowElementHast | MdxJsxTextElementHast;

interface Parent {
  children: (RootContent | ElementContent)[];
}

/** A part of a reference, see `SlideElementReference` in `@seminar/core`. */
type ReferencePart = string | [string];

function isJsxElement(node: RootContent | ElementContent): node is JsxElement {
  return node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement';
}

/** Whether `name` is the name of an HTML or SVG element, not a component. */
function isIntrinsic(name: string): boolean {
  return /^[a-z]/.test(name) || name.includes('-');
}

/** Returns the value of the string attribute `name` of `element`, if any. */
function stringAttribute(
  element: JsxElement,
  name: string,
): string | undefined {
  for (const attribute of element.attributes) {
    if (
      attribute.type === 'mdxJsxAttribute' &&
      attribute.name === name &&
      typeof attribute.value === 'string'
    ) {
      return attribute.value;
    }
  }
  return undefined;
}

/** Calls `visit` with the JSX elements in a slide, but not in nested slides. */
function forEachElement(
  parent: Parent,
  visit: (element: JsxElement) => void,
): void {
  for (const child of parent.children) {
    if (!('children' in child)) {
      continue;
    }
    if (isJsxElement(child)) {
      if (child.name === SLIDE) {
        // Slides inside slides, if any, name their own elements.
        continue;
      }
      visit(child);
    }
    forEachElement(child, visit);
  }
}

/** Attributes whose values are `#` and the id of an element. */
const HREF_ATTRIBUTES: ReadonlySet<string> = new Set([
  'href',
  'xlinkHref',
  'xlink:href',
]);

/** Attributes whose values are lists of ids, separated by spaces. */
const ID_LIST_ATTRIBUTES: ReadonlySet<string> = new Set([
  'aria-activedescendant',
  'aria-controls',
  'aria-describedby',
  'aria-details',
  'aria-errormessage',
  'aria-flowto',
  'aria-labelledby',
  'aria-owns',
  'for',
  'form',
  'headers',
  'htmlFor',
  'list',
]);

/** Matches references to ids in CSS, e.g., `url(#gradient)`. */
const URL_PATTERN = /url\(\s*(['"]?)#([^)'"\s]+)\1\s*\)/g;

/** Joins adjacent text in `parts`, and leaves out empty text. */
function mergeParts(parts: ReferencePart[]): ReferencePart[] {
  const merged: ReferencePart[] = [];
  for (const part of parts) {
    const last = merged.at(-1);
    if (typeof part === 'string' && typeof last === 'string') {
      merged[merged.length - 1] = last + part;
    } else if (part !== '') {
      merged.push(part);
    }
  }
  return merged;
}

/**
 * Returns the parts of an attribute value that refers to names of elements on
 * the slide, or `undefined` if it doesn't refer to any.
 */
function referenceParts(
  attribute: string,
  value: string,
  names: ReadonlySet<string>,
): ReferencePart[] | undefined {
  if (HREF_ATTRIBUTES.has(attribute)) {
    const name = value.startsWith('#') ? value.slice(1) : undefined;
    return name !== undefined && names.has(name) ? ['#', [name]] : undefined;
  }
  const parts: ReferencePart[] = [];
  let found = false;
  if (ID_LIST_ATTRIBUTES.has(attribute)) {
    for (const [index, token] of value.trim().split(/\s+/).entries()) {
      if (index > 0) parts.push(' ');
      if (names.has(token)) {
        parts.push([token]);
        found = true;
      } else {
        parts.push(token);
      }
    }
    return found ? mergeParts(parts) : undefined;
  }
  let start = 0;
  for (const match of value.matchAll(URL_PATTERN)) {
    const name = match[2] ?? '';
    if (!names.has(name)) continue;
    const quote = match[1] ?? '';
    parts.push(`${value.slice(start, match.index)}url(${quote}#`, [name]);
    start = match.index + match[0].length;
    parts.push(`${quote})`);
    found = true;
  }
  if (!found) return undefined;
  parts.push(value.slice(start));
  return mergeParts(parts);
}

/** Collects the strings in an expression, i.e., literals and template text. */
function collectStrings(node: unknown, strings: string[]): void {
  if (typeof node !== 'object' || node === null) {
    return;
  }
  const { type } = node as { type?: unknown };
  if (type === 'Literal') {
    const { value } = node as { value?: unknown };
    if (typeof value === 'string') strings.push(value);
  } else if (type === 'TemplateElement') {
    const { value } = node as { value?: { cooked?: unknown } };
    if (typeof value?.cooked === 'string') strings.push(value.cooked);
  }
  for (const [key, child] of Object.entries(node)) {
    if (key !== 'loc' && key !== 'range' && key !== 'position') {
      collectStrings(child, strings);
    }
  }
}

/**
 * Returns the names of elements on the slide that a `style` expression refers
 * to in `url(#…)`, also when the name is a separate string, e.g., in
 * `` `url(#${active ? 'on' : 'off'})` ``.
 */
function styleNames(
  attribute: JsxElement['attributes'][number],
  names: ReadonlySet<string>,
): string[] {
  if (
    attribute.type !== 'mdxJsxAttribute' ||
    attribute.name !== 'style' ||
    typeof attribute.value !== 'object' ||
    attribute.value === null
  ) {
    return [];
  }
  const strings: string[] = [];
  collectStrings(attribute.value.data?.estree, strings);
  if (!strings.some((string) => string.includes('url('))) {
    return [];
  }
  const found = new Set<string>();
  for (const string of strings) {
    if (names.has(string)) found.add(string);
    for (const match of string.matchAll(URL_PATTERN)) {
      const name = match[2] ?? '';
      if (names.has(name)) found.add(name);
    }
  }
  return [...found];
}

/**
 * Names the elements with an `id` in a slide, and makes the attributes of HTML
 * and SVG elements that refer to them refer to the same rendering of the
 * slide.
 */
function nameElements(slide: Parent, names: ReadonlySet<string>): void {
  forEachElement(slide, (element) => {
    if (element.name === null || !isIntrinsic(element.name)) {
      // Components get the name as their `id`, e.g., steps, which give their
      // elements ids of their own.
      return;
    }
    const references: Record<string, ReferencePart[]> = {};
    const attributes: typeof element.attributes = [];
    let name: string | undefined;
    let style: string[] = [];
    for (const attribute of element.attributes) {
      style = [...style, ...styleNames(attribute, names)];
      if (
        attribute.type === 'mdxJsxAttribute' &&
        typeof attribute.value === 'string'
      ) {
        if (attribute.name === 'id') {
          name = attribute.value;
          continue;
        }
        const parts = referenceParts(attribute.name, attribute.value, names);
        if (parts !== undefined) {
          references[attribute.name] = parts;
          continue;
        }
      }
      attributes.push(attribute);
    }
    const hasReferences = Object.keys(references).length > 0;
    if (name === undefined && !hasReferences && style.length === 0) {
      return;
    }
    element.attributes = [
      createStringAttribute('as', element.name),
      ...(name === undefined ? [] : [createStringAttribute('name', name)]),
      ...(hasReferences
        ? [
            createExpressionAttribute(
              'references',
              `(${JSON.stringify(references)})`,
            ),
          ]
        : []),
      ...(style.length === 0
        ? []
        : [
            createExpressionAttribute(
              'styleNames',
              `(${JSON.stringify(style)})`,
            ),
          ]),
      ...attributes,
    ];
    element.name = SLIDE_ELEMENT;
  });
}

function findSlides(parent: Parent, file: VFile): void {
  for (const child of parent.children) {
    if (!('children' in child)) {
      continue;
    }
    if (isJsxElement(child) && child.name === SLIDE) {
      const places = new Map<string, (Position | undefined)[]>();
      forEachElement(child, (element) => {
        const id = stringAttribute(element, 'id');
        if (id !== undefined) {
          places.set(id, [...(places.get(id) ?? []), element.position]);
        }
      });
      for (const [name, positions] of places) {
        for (const place of positions.slice(1)) {
          file.message(
            `The id \`${name}\` is used more than once on the slide`,
            { place },
          );
        }
      }
      nameElements(child, new Set(places.keys()));
    } else {
      findSlides(child, file);
    }
  }
}

/**
 * Turns ids in slides, e.g., `<img id="arch">` or `:step{#parse}`, into names
 * of elements on the slide. A deck renders a slide several times at once, so
 * HTML and SVG elements become `SlideElement`s, which give them ids unique in
 * the document, and components, like steps, get the name as their `id`.
 * Attributes of HTML and SVG elements that refer to the names, e.g.,
 * `fill="url(#gradient)"` or `href="#icon"` in inline SVG, refer to the same
 * rendering of the slide, and so do `url(#…)` references in `style` objects
 * (see `styleNames` of `SlideElement`). Warns about names used more than once
 * on a slide.
 *
 * Must run after `rehypeListSteps`, which turns list items into steps.
 */
export function rehypeSlideElements(): (tree: Root, file: VFile) => void {
  return (tree, file) => {
    findSlides(tree, file);
  };
}
