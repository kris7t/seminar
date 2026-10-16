import type { Element, ElementContent, Root, RootContent } from 'hast';
import type { Position } from 'unist';
import type {
  MdxJsxAttribute,
  MdxJsxFlowElementHast,
} from 'mdast-util-mdx-jsx';
import { find, html } from 'property-information';
import type { VFile } from 'vfile';

import { createStringAttribute } from '../utils/estree.ts';
import { EXPLICIT_JSX_HAST, SLIDE, STEP } from '../utils/jsx.ts';
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
 * Converts a list item to a step, with the props from its `:step` directive
 * (see {@link remarkSteps}), if any. Without one, it's shown along with the
 * previous step.
 */
function convertListItem(item: Element): MdxJsxFlowElementHast {
  const { [STEP_PROPERTY]: stepProps, ...properties } = item.properties;
  const props =
    typeof stepProps === 'string'
      ? (JSON.parse(stepProps) as Record<string, string>)
      : { with: 'previous' };
  const { className, ...otherProps } = props;
  if (className !== undefined) {
    properties.className = [
      ...(Array.isArray(properties.className) ? properties.className : []),
      ...className.split(' '),
    ];
  }
  if (otherProps['id'] !== undefined) {
    properties.id = otherProps['id'];
  }
  const attributes = [
    createStringAttribute('component', 'li'),
    ...convertProperties({ ...item, properties }),
    ...Object.entries(otherProps)
      .filter(([name]) => name !== 'id')
      .map(([name, value]) => createStringAttribute(name, value)),
  ];
  return {
    type: 'mdxJsxFlowElement',
    name: STEP,
    attributes,
    children: item.children,
    data: EXPLICIT_JSX_HAST,
    ...(item.position === undefined ? {} : { position: item.position }),
  };
}

/** A use of a step group on a slide. */
interface GroupUse {
  place: Position;
  /** Number of enclosing steps, which determines the element placing the group. */
  depth: number;
  /** The explicit `with` attribute of the element, if any. */
  with: string | undefined;
  /** Whether the group is named after the id of the step. */
  implicit: boolean;
}

/** Uses of each step group on a slide, to check them for mistakes. */
interface GroupUses {
  uses: Map<string, GroupUse[]>;
  /** Places where steps are nested in each group with `in`. */
  nested: Map<string, Position[]>;
  /** Places where steps are placed after each group with `after`. */
  followed: Map<string, Position[]>;
}

function createGroupUses(): GroupUses {
  return { uses: new Map(), nested: new Map(), followed: new Map() };
}

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

/** Whether `node` is a `Step`, which joins the group named after its id. */
function isStepElement(node: RootContent | ElementContent): boolean {
  return (
    (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') &&
    (node.name === STEP || node.name === 'Step')
  );
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
function checkGroups(
  { uses: groups, nested, followed }: GroupUses,
  file: VFile,
) {
  for (const [references, purpose] of [
    [nested, 'nest a step in'],
    [followed, 'place a step after'],
  ] as const) {
    for (const [group, places] of references) {
      if (!groups.has(group)) {
        for (const place of places) {
          file.message(
            `There is no step group \`${group}\` on the slide to ${purpose}`,
            { place },
          );
        }
      }
    }
  }
  for (const [group, uses] of groups) {
    const [anchor, ...others] = uses.toSorted(
      (a, b) =>
        a.depth - b.depth ||
        (a.place.start.offset ?? 0) - (b.place.start.offset ?? 0),
    );
    if (anchor === undefined) {
      continue;
    }
    // Groups that other steps are nested in or placed after may have a single
    // element, and so may groups named after the ids of their steps.
    if (
      others.length === 0 &&
      !anchor.implicit &&
      !nested.has(group) &&
      !followed.has(group)
    ) {
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
      const slideGroups: GroupUses = isSlide ? createGroupUses() : groups;
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
        ? convertListItem(child)
        : child;
    for (const [attribute, references] of [
      ['in', groups.nested],
      ['after', groups.followed],
    ] as const) {
      const referenced = getAttribute(converted, attribute);
      if (referenced !== undefined && child.position !== undefined) {
        references.set(referenced, [
          ...(references.get(referenced) ?? []),
          child.position,
        ]);
      }
    }
    // Steps with an id are in the group of the same name by default.
    const explicitGroup = getAttribute(converted, 'group');
    const group =
      explicitGroup ??
      (isStepElement(converted) ? getAttribute(converted, 'id') : undefined);
    if (group !== undefined && child.position !== undefined) {
      groups.uses.set(group, [
        ...(groups.uses.get(group) ?? []),
        {
          place: child.position,
          depth,
          with: getAttribute(converted, 'with'),
          implicit: explicitGroup === undefined,
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
 * A `:step` directive at the start or the end of the first line of an item,
 * e.g., `- :step Item` or `- Item :step{with=initial}`, sets the props of the
 * step (see {@link remarkSteps}):
 *
 * - `:step` starts a new step with the item.
 * - `with=previous` or `with=initial` set the `with` prop instead.
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
export function rehypeListSteps(): (tree: Root, file: VFile) => void {
  return (tree, file) => {
    convertChildren(tree, file, createGroupUses(), 0);
  };
}
