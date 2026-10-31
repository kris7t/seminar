import type { Element, ElementContent, Root, RootContent } from 'hast';
import type {
  MdxJsxAttribute,
  MdxJsxFlowElementHast,
} from 'mdast-util-mdx-jsx';
import { find, html } from 'property-information';

import { createStringAttribute } from '../utils/estree.ts';
import { EXPLICIT_JSX_HAST, LIST_ITEM } from '../utils/jsx.ts';
import { STEP_PROPERTY } from './remarkSteps.ts';

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
 * Converts a list item to a `ListItem`, with the props from its `:step`
 * directive (see {@link remarkSteps}), if any, which makes it a step of its
 * own. Without one, it's shown along with the previous step.
 */
function convertListItem(item: Element): MdxJsxFlowElementHast {
  const { [STEP_PROPERTY]: stepProps, ...properties } = item.properties;
  const props =
    typeof stepProps === 'string'
      ? (JSON.parse(stepProps) as Record<string, string>)
      : undefined;
  const { className, ...otherProps } = props ?? {};
  if (className !== undefined) {
    properties.className = [
      ...(Array.isArray(properties.className) ? properties.className : []),
      ...className.split(' '),
    ];
  }
  if (otherProps['id'] !== undefined) {
    properties.id = otherProps['id'];
  }
  const attributes: MdxJsxAttribute[] = [
    ...(props === undefined
      ? []
      : [{ type: 'mdxJsxAttribute', name: 'step', value: null } as const]),
    ...convertProperties({ ...item, properties }),
    ...Object.entries(otherProps)
      .filter(([name]) => name !== 'id')
      .map(([name, value]) => createStringAttribute(name, value)),
  ];
  return {
    type: 'mdxJsxFlowElement',
    name: LIST_ITEM,
    attributes,
    children: item.children,
    data: EXPLICIT_JSX_HAST,
    ...(item.position === undefined ? {} : { position: item.position }),
  };
}

function convertChildren(parent: {
  children: (RootContent | ElementContent)[];
}) {
  parent.children = parent.children.map((child) => {
    if ('children' in child) {
      convertChildren(child);
    }
    return child.type === 'element' && child.tagName === 'li'
      ? convertListItem(child)
      : child;
  });
}

/**
 * Turns the items of Markdown lists into steps, which are shown together with
 * the previous step by default, i.e., up front if there are no steps before
 * the list.
 *
 * A `:step` directive at the start or the end of the first line of an item,
 * e.g., `- :step Item` or `- Item :step{with=initial}`, sets the props of the
 * step (see {@link remarkSteps}):
 *
 * - `:step` starts a new step with the item.
 * - `with=previous`, `with=content`, or `with=initial` set the `with` prop
 *   instead.
 * - `group=name` shares a step with the other items and steps of the group
 *   `name` on the slide (see the `group` prop of `Step`). The first item of
 *   the group starts a new step, unless it has a `with` attribute, which
 *   applies to the whole group, e.g., `:step{group=name with=initial}` shows
 *   the group up front. `with` is ignored on the other items of the group.
 * - `in=name` nests the step in the step of the group `name` on the slide, as
 *   if it was inside it, e.g., for callouts of a list item elsewhere.
 * - `after=name` places the step right after the group `name` on the slide,
 *   nested in the same step as the group.
 * - `title` sets the title of the step in the tree of steps.
 * - Ids, classes, and other attributes are passed to the step. A step with
 *   an id is in the group of the same name, unless it has a `group`.
 *
 * Must run after {@link remarkSlides}, which imports the `Step` component.
 */
export function rehypeListSteps(): (tree: Root) => void {
  return (tree) => {
    convertChildren(tree);
  };
}
