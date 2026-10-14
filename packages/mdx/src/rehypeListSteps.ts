import type { Element, ElementContent, Root, RootContent, Text } from 'hast';
import type { Position } from 'unist';
import type {
  MdxJsxAttribute,
  MdxJsxFlowElementHast,
} from 'mdast-util-mdx-jsx';
import { find, html } from 'property-information';
import type { VFile } from 'vfile';

import {
  splitLeadingAttributeBlock,
  splitTrailingAttributeBlock,
  type AttributeBlock,
} from './attributes.ts';
import { createStringAttribute } from './estree.ts';
import { SLIDE, STEP } from './remarkSlides.ts';

/** Flag of list items that start a new step. */
const STEP_FLAG = 'step';

const FLAGS: ReadonlySet<string> = new Set([STEP_FLAG]);

const WITH_VALUES: ReadonlySet<string> = new Set(['previous', 'initial']);

/** Elements that end the text of a list item before nested content. */
const BLOCK_ELEMENTS: ReadonlySet<string> = new Set([
  'blockquote',
  'div',
  'ol',
  'p',
  'pre',
  'table',
  'ul',
]);

/** See {@link remarkSlides}. */
const EXPLICIT_JSX = {
  _mdxExplicitJsx: true,
} as MdxJsxFlowElementHast['data'];

function isWhitespace(node: ElementContent): boolean {
  return node.type === 'text' && node.value.trim() === '';
}

/**
 * Returns the text nodes at the start and the end of the first line of a list
 * item, which may hold attribute blocks. Tight lists have their text directly
 * in the item, while loose lists wrap it in a paragraph.
 */
function findLineTexts(item: Element): [Text | undefined, Text | undefined] {
  let content = item.children;
  const first = content.find((child) => !isWhitespace(child));
  if (first?.type === 'element' && first.tagName === 'p') {
    content = first.children;
  }
  const line: ElementContent[] = [];
  for (const child of content) {
    if (child.type === 'element' && BLOCK_ELEMENTS.has(child.tagName)) {
      break;
    }
    if (!isWhitespace(child)) {
      line.push(child);
    }
  }
  const asText = (node: ElementContent | undefined) =>
    node?.type === 'text' ? node : undefined;
  return [asText(line[0]), asText(line.at(-1))];
}

/** Merges the attribute blocks at the start and the end of a list item. */
function mergeBlocks(
  leading: AttributeBlock,
  trailing: AttributeBlock,
  file: VFile,
): AttributeBlock {
  if (leading.id !== undefined && trailing.id !== undefined) {
    file.message(
      `Ignoring \`#${leading.id}\` in favor of \`#${trailing.id}\` on a list item`,
    );
  }
  for (const key of trailing.attributes.keys()) {
    if (leading.attributes.has(key)) {
      file.message(`Ignoring the first \`${key}\` attribute on a list item`);
    }
  }
  return {
    id: trailing.id ?? leading.id,
    classes: [...leading.classes, ...trailing.classes],
    attributes: new Map([...leading.attributes, ...trailing.attributes]),
    flags: [...leading.flags, ...trailing.flags],
  };
}

/**
 * Removes attribute blocks from the start and the end of the first line of
 * `item`.
 */
function takeAttributeBlock(
  item: Element,
  file: VFile,
): AttributeBlock | undefined {
  const [first, last] = findLineTexts(item);
  let leading: AttributeBlock | undefined;
  if (first !== undefined) {
    const split = splitLeadingAttributeBlock(first.value, FLAGS);
    if (split !== undefined) {
      [leading, first.value] = split;
    }
  }
  let trailing: AttributeBlock | undefined;
  if (last !== undefined) {
    const split = splitTrailingAttributeBlock(last.value, FLAGS);
    if (split !== undefined) {
      [last.value, trailing] = split;
    }
  }
  if (leading === undefined || trailing === undefined) {
    return leading ?? trailing;
  }
  return mergeBlocks(leading, trailing, file);
}

/** Converts the hast properties of an element to JSX attributes. */
function convertProperties(element: Element): MdxJsxAttribute[] {
  return Object.entries(element.properties).flatMap(([key, value]) => {
    if (value === undefined || value === null || value === false) {
      return [];
    }
    const name = key === 'className' ? key : find(html, key).attribute;
    if (value === true) {
      return [{ type: 'mdxJsxAttribute', name, value: null }];
    }
    return [
      createStringAttribute(
        name,
        Array.isArray(value) ? value.join(' ') : String(value),
      ),
    ];
  });
}

/**
 * Determines the `with` prop of a list item from its attribute block.
 *
 * @returns `undefined` to start a new step.
 */
function getWith(
  { flags, attributes }: AttributeBlock,
  file: VFile,
): string | undefined {
  const withValue = attributes.get('with');
  if (withValue !== undefined && !WITH_VALUES.has(withValue)) {
    file.message(
      `Expected \`with=previous\` or \`with=initial\` on a list item, got \`with=${withValue}\``,
    );
    return 'previous';
  }
  if (flags.includes(STEP_FLAG)) {
    if (withValue !== undefined) {
      file.message(
        `Ignoring \`with=${withValue}\` on a list item with \`${STEP_FLAG}\``,
      );
    }
    return undefined;
  }
  // The first item of a group starts a new step by default, since joining the
  // previous step wouldn't need a group.
  return withValue ?? (attributes.has('group') ? undefined : 'previous');
}

function convertListItem(item: Element, file: VFile): MdxJsxFlowElementHast {
  const block = takeAttributeBlock(item, file);
  const withValue = block === undefined ? 'previous' : getWith(block, file);
  const properties = { ...item.properties };
  if (block !== undefined) {
    properties.id = block.id ?? properties.id;
    if (block.classes.length > 0) {
      properties.className = [
        ...(Array.isArray(properties.className) ? properties.className : []),
        ...block.classes,
      ];
    }
  }
  const attributes = [
    createStringAttribute('component', 'li'),
    ...(withValue === undefined
      ? []
      : [createStringAttribute('with', withValue)]),
    ...convertProperties({ ...item, properties }),
    ...[...(block?.attributes ?? [])]
      .filter(([name]) => name !== 'with')
      .map(([name, value]) => createStringAttribute(name, value)),
  ];
  return {
    type: 'mdxJsxFlowElement',
    name: STEP,
    attributes,
    children: item.children,
    data: EXPLICIT_JSX,
  };
}

/** A use of a step group on a slide. */
interface GroupUse {
  place: Position;
  /** Number of enclosing steps, which determines the element placing the group. */
  depth: number;
  /** The explicit `with` attribute of the element, if any. */
  with: string | undefined;
}

/** Uses of each step group on a slide, to check them for mistakes. */
type GroupUses = Map<string, GroupUse[]>;

/** Names of the JSX elements counted as enclosing steps. */
const STEP_ELEMENTS: ReadonlySet<string> = new Set([STEP, 'Step', 'Steps']);

/** Returns the value of a string attribute of a JSX element, if any. */
function getAttribute(
  node: RootContent | ElementContent,
  name: string,
): string | undefined {
  if (node.type !== 'mdxJsxFlowElement' && node.type !== 'mdxJsxTextElement') {
    return undefined;
  }
  for (const attribute of node.attributes) {
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

function isStep(node: RootContent | ElementContent): boolean {
  return (
    (node.type === 'element' && node.tagName === 'li') ||
    ((node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') &&
      node.name !== null &&
      STEP_ELEMENTS.has(node.name))
  );
}

/**
 * Checks the step groups of a slide. As in `@slider/core`, the least nested
 * element of a group (the first one if there are several) places the group,
 * so `with` is ignored on the other elements.
 */
function checkGroups(groups: GroupUses, file: VFile) {
  for (const [group, uses] of groups) {
    const [anchor, ...others] = uses.toSorted(
      (a, b) =>
        a.depth - b.depth ||
        (a.place.start.offset ?? 0) - (b.place.start.offset ?? 0),
    );
    if (anchor === undefined) {
      continue;
    }
    if (others.length === 0) {
      file.message(
        `The step group \`${group}\` is only used once on the slide`,
        { place: anchor.place },
      );
    }
    for (const { place, with: withValue } of others) {
      if (withValue !== undefined) {
        file.message(
          `Ignoring \`with=${withValue}\` on the step group \`${group}\`, which is placed by its first element`,
          { place },
        );
      }
    }
  }
}

function convertChildren(
  parent: { children: (RootContent | ElementContent)[] },
  file: VFile,
  groups: GroupUses,
  depth: number,
) {
  parent.children = parent.children.map((child) => {
    const isSlide = child.type === 'mdxJsxFlowElement' && child.name === SLIDE;
    if ('children' in child) {
      const slideGroups: GroupUses = isSlide
        ? new Map<string, GroupUse[]>()
        : groups;
      convertChildren(
        child,
        file,
        slideGroups,
        isStep(child) ? depth + 1 : depth,
      );
      if (isSlide) {
        checkGroups(slideGroups, file);
      }
    }
    const converted =
      child.type === 'element' && child.tagName === 'li'
        ? convertListItem(child, file)
        : child;
    const group = getAttribute(converted, 'group');
    if (group !== undefined && child.position !== undefined) {
      groups.set(group, [
        ...(groups.get(group) ?? []),
        {
          place: child.position,
          depth,
          with: getAttribute(converted, 'with'),
        },
      ]);
    }
    return converted;
  });
}

/**
 * Turns the items of Markdown lists into steps, which are shown together with
 * the previous step by default, i.e., up front if there are no steps before
 * the list.
 *
 * An attribute block at the start or the end of the first line of an item,
 * e.g., `- \{step} Item` or `- Item \{step}`, sets the props of the step:
 *
 * - `step` starts a new step with the item.
 * - `with=previous` (the default) or `with=initial` set the `with` prop.
 * - `group=name` shares a step with the other items and steps of the group
 *   `name` on the slide (see the `group` prop of `Step`). The first item of
 *   the group starts a new step, unless it has a `with` attribute, which
 *   applies to the whole group, e.g., `\{group=name with=initial}` shows the
 *   group up front. `with` is ignored on the other items of the group.
 * - Ids, classes, and other attributes are passed to the step.
 *
 * Must run after {@link remarkSlides}, which imports the `Step` component.
 */
export function rehypeListSteps(): (tree: Root, file: VFile) => void {
  return (tree, file) => {
    convertChildren(tree, file, new Map(), 0);
  };
}
