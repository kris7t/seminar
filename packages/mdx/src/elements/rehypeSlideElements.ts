import type { ElementContent, Root, RootContent } from 'hast';
import type {
  MdxJsxFlowElementHast,
  MdxJsxTextElementHast,
} from 'mdast-util-mdx-jsx';
import type { Position } from 'unist';
import type { VFile } from 'vfile';

import { createStringAttribute } from '../utils/estree.ts';
import { SLIDE, SLIDE_ELEMENT } from '../utils/jsx.ts';

type JsxElement = MdxJsxFlowElementHast | MdxJsxTextElementHast;

function isJsxElement(node: RootContent | ElementContent): node is JsxElement {
  return node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement';
}

/** Whether `name` is the name of an HTML or SVG element, not a component. */
function isIntrinsic(name: string): boolean {
  return /^[a-z]/.test(name) || name.includes('-');
}

/** Returns the index of the `id` attribute of `element` with a string value. */
function idAttributeOf(element: JsxElement): number {
  return element.attributes.findIndex(
    (attribute) =>
      attribute.type === 'mdxJsxAttribute' &&
      attribute.name === 'id' &&
      typeof attribute.value === 'string',
  );
}

/**
 * Names the elements with an `id` in a slide, and collects the places of the
 * names to check that they're unique.
 */
function nameElements(
  parent: { children: (RootContent | ElementContent)[] },
  names: Map<string, (Position | undefined)[]>,
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
      const index = idAttributeOf(child);
      const attribute = child.attributes[index];
      if (attribute?.type === 'mdxJsxAttribute') {
        const name = attribute.value as string;
        names.set(name, [...(names.get(name) ?? []), child.position]);
        // Components get the name as their `id`, e.g., steps, which give
        // their elements ids of their own.
        if (child.name !== null && isIntrinsic(child.name)) {
          child.attributes.splice(
            index,
            1,
            createStringAttribute('as', child.name),
            createStringAttribute('name', name),
          );
          child.name = SLIDE_ELEMENT;
        }
      }
    }
    nameElements(child, names);
  }
}

function findSlides(
  parent: { children: (RootContent | ElementContent)[] },
  file: VFile,
): void {
  for (const child of parent.children) {
    if (!('children' in child)) {
      continue;
    }
    if (isJsxElement(child) && child.name === SLIDE) {
      const names = new Map<string, (Position | undefined)[]>();
      nameElements(child, names);
      for (const [name, places] of names) {
        for (const place of places.slice(1)) {
          file.message(
            `The id \`${name}\` is used more than once on the slide`,
            { place },
          );
        }
      }
    } else {
      findSlides(child, file);
    }
  }
}

/**
 * Turns ids in slides, e.g., `<img id="arch">` or `:step{#parse}`, into names
 * of elements on the slide. A deck renders a slide several times at once, so
 * HTML elements become `SlideElement`s, which give them ids unique in the
 * document, and components, like steps, get the name as their `id`. Warns
 * about names used more than once on a slide.
 *
 * Must run after `rehypeListSteps`, which turns list items into steps.
 */
export function rehypeSlideElements(): (tree: Root, file: VFile) => void {
  return (tree, file) => {
    findSlides(tree, file);
  };
}
