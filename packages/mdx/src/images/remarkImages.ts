import type {
  Image,
  ImageReference,
  Nodes,
  Paragraph,
  PhrasingContent,
  Root,
} from 'mdast';
import type { TextDirective } from 'mdast-util-directive';
import type {
  MdxJsxAttribute,
  MdxJsxFlowElement,
  MdxJsxTextElement,
} from 'mdast-util-mdx';
import type { VFile } from 'vfile';

import { getAttributes, takeDirective } from '../directives/directives.ts';
import { IMAGE_ATTRIBUTES } from '../directives/remarkHeadingAttributes.ts';
import { getStepProps } from '../steps/remarkSteps.ts';
import {
  createEsm,
  createExpressionAttribute,
  createStringAttribute,
} from '../utils/estree.ts';
import { EXPLICIT_JSX, IMAGE, NOTES } from '../utils/jsx.ts';

type ImageNode = Image | ImageReference;

interface ImageSource {
  url: string;
  title?: string | null | undefined;
}

/** State of the conversion of the images of a document. */
interface Images {
  file: VFile;
  /** Link reference definitions, by their identifiers. */
  definitions: Map<string, ImageSource>;
  /** Names of the imports of local images, by their URLs. */
  imports: Map<string, string>;
}

function isImage(node: Nodes): node is ImageNode {
  return node.type === 'image' || node.type === 'imageReference';
}

function isAttributes(node: Nodes | undefined): node is TextDirective {
  return node?.type === 'textDirective' && node.name === IMAGE_ATTRIBUTES;
}

function isStepDirective(node: Nodes): boolean {
  return node.type === 'textDirective' && node.name === 'step';
}

function isBlank(node: PhrasingContent): boolean {
  return node.type === 'text' && node.value.trim() === '';
}

/** Whether `url` refers to a file next to the deck, which is imported. */
function isLocal(url: string): boolean {
  return url !== '' && !/^(?:[a-z][a-z\d+.-]*:|\/|#|\?)/i.test(url);
}

/** Returns the attribute for the `src` of an image, importing local files. */
function sourceAttribute(url: string, images: Images): MdxJsxAttribute {
  if (!isLocal(url)) {
    return createStringAttribute('src', url);
  }
  let name = images.imports.get(url);
  if (name === undefined) {
    name = `_SliderImage${String(images.imports.size)}`;
    images.imports.set(url, name);
  }
  return createExpressionAttribute('src', name);
}

/** Returns the URL and title of an image, following its reference. */
function sourceOf(node: ImageNode, images: Images): ImageSource | undefined {
  if (node.type === 'image') {
    return node;
  }
  const source = images.definitions.get(node.identifier.toLowerCase());
  if (source === undefined) {
    images.file.message(
      `There is no definition \`${node.label ?? node.identifier}\` for the image`,
      { place: node.position },
    );
  }
  return source;
}

/**
 * Converts an image to an `Image` (or an `img` in notes), with the attributes
 * of the directive after it, if any.
 */
function convertImage(
  node: ImageNode,
  attributes: TextDirective | undefined,
  images: Images,
  options: {
    block: boolean;
    inNotes: boolean;
    step?: TextDirective | undefined;
  },
): MdxJsxFlowElement | MdxJsxTextElement | undefined {
  const source = sourceOf(node, images);
  if (source === undefined) {
    return undefined;
  }
  const { id, classes, attributes: others } = getAttributes(attributes ?? {});
  const jsxAttributes: MdxJsxAttribute[] = [
    sourceAttribute(source.url, images),
    createStringAttribute('alt', node.alt ?? ''),
    ...(source.title === null || source.title === undefined
      ? []
      : [createStringAttribute('title', source.title)]),
    ...(options.block && !options.inNotes
      ? [{ type: 'mdxJsxAttribute', name: 'block', value: null } as const]
      : []),
    ...(options.step === undefined
      ? []
      : [
          { type: 'mdxJsxAttribute', name: 'step', value: null } as const,
          ...getStepProps(getAttributes(options.step), images.file).map(
            ([name, value]) => createStringAttribute(name, value),
          ),
        ]),
    ...(id === undefined ? [] : [createStringAttribute('id', id)]),
    ...(classes.length === 0
      ? []
      : [createStringAttribute('className', classes.join(' '))]),
    ...[...others].map(([name, value]) => createStringAttribute(name, value)),
  ];
  const element = {
    type: options.block ? 'mdxJsxFlowElement' : 'mdxJsxTextElement',
    // Notes aren't on a slide, so their images aren't steps.
    name: options.inNotes ? 'img' : IMAGE,
    attributes: jsxAttributes,
    children: [],
    data: EXPLICIT_JSX,
  } as MdxJsxFlowElement | MdxJsxTextElement;
  if (node.position !== undefined) {
    element.position = node.position;
  }
  return element;
}

/**
 * Returns the image of a paragraph with only an image, its attributes, and
 * maybe a `:step`, which is a block of its own.
 */
function blockImage(paragraph: Paragraph): ImageNode | undefined {
  const content = paragraph.children.filter(
    (child) =>
      !isBlank(child) && !isAttributes(child) && !isStepDirective(child),
  );
  const [image] = content;
  return content.length === 1 && image !== undefined && isImage(image)
    ? image
    : undefined;
}

function convertChildren(
  parent: { children: Nodes[] },
  images: Images,
  inNotes: boolean,
): void {
  const children: Nodes[] = [];
  for (let index = 0; index < parent.children.length; index += 1) {
    const child = parent.children[index];
    if (child === undefined) {
      continue;
    }
    const childInNotes =
      inNotes || (child.type === 'mdxJsxFlowElement' && child.name === NOTES);
    if (child.type === 'paragraph') {
      const image = blockImage(child);
      if (image !== undefined) {
        const step = takeDirective(child.children, 'step');
        const converted = convertImage(
          image,
          child.children.find(isAttributes),
          images,
          { block: true, inNotes, step },
        );
        if (converted !== undefined) {
          children.push(converted);
          continue;
        }
      }
    }
    if (isImage(child)) {
      const next = parent.children[index + 1];
      const attributes = isAttributes(next) ? next : undefined;
      const converted = convertImage(child, attributes, images, {
        block: false,
        inNotes,
      });
      if (converted !== undefined) {
        children.push(converted);
        if (attributes !== undefined) {
          index += 1;
        }
        continue;
      }
    }
    if ('children' in child) {
      convertChildren(child, images, childInNotes);
    }
    children.push(child);
  }
  parent.children = children;
}

function collectDefinitions(node: Nodes, images: Images): void {
  if (node.type === 'definition') {
    images.definitions.set(node.identifier.toLowerCase(), node);
  }
  if ('children' in node) {
    for (const child of node.children) {
      collectDefinitions(child, images);
    }
  }
}

/**
 * Turns Markdown images into `Image`s, with the attributes after them, e.g.,
 * `![Architecture](./arch.svg){#arch step}`, which `remarkHeadingAttributes`
 * rewrites to directives:
 *
 * - An image on a line of its own, i.e., a paragraph with only the image, and
 *   maybe a `:step`, is a block, which takes the props of the `:step`.
 * - Other images are in the text.
 *
 * Images next to the deck, e.g., `./arch.svg`, are imported, so that bundlers
 * resolve them relative to the deck, even if it's included in another deck,
 * and can inline them. Images in notes are plain `img` elements.
 *
 * Must run before `remarkSteps`, which turns paragraphs into steps.
 */
export function remarkImages(): (tree: Root, file: VFile) => void {
  return (tree, file) => {
    const images: Images = {
      file,
      definitions: new Map(),
      imports: new Map(),
    };
    collectDefinitions(tree, images);
    convertChildren(tree, images, false);
    tree.children.unshift(
      ...[...images.imports].map(([url, name]) => {
        let path = url;
        try {
          path = decodeURI(url);
        } catch {
          // Keep URLs with invalid escapes as they are.
        }
        return createEsm(`import ${name} from ${JSON.stringify(path)};`);
      }),
    );
  };
}
