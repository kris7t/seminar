import type { Parents, Root } from 'mdast';
import type { MdxJsxFlowElement } from 'mdast-util-mdx';
import type { VFile } from 'vfile';

import {
  getAttributes,
  takeDirective,
  type Attributes,
} from '../directives/directives.ts';
import { createStringAttribute } from '../utils/estree.ts';
import { EXPLICIT_JSX, NOTES, PARAGRAPH } from '../utils/jsx.ts';

/**
 * Name of the hast property of list items with the attributes of their `:step`
 * directive, as JSON, which {@link rehypeListSteps} reads.
 */
export const STEP_PROPERTY = 'dataSeminarStep';

const WITH_VALUES: ReadonlySet<string> = new Set([
  'self',
  'previous',
  'content',
  'initial',
]);

/**
 * Returns the `with` prop of a step from the attributes of its directive.
 *
 * @returns `undefined` to start a new step.
 */
export function getWith(
  { attributes }: Attributes,
  file: VFile,
): string | undefined {
  const withValue = attributes.get('with');
  if (withValue !== undefined && !WITH_VALUES.has(withValue)) {
    file.message(
      `Expected \`with=self\`, \`with=previous\`, \`with=content\`, or \`with=initial\` on \`:step\`, got \`with=${withValue}\``,
    );
    return 'previous';
  }
  return withValue;
}

/** Converts the attributes of a `:step` directive to the props of a step. */
export function getStepProps(
  attributes: Attributes,
  file: VFile,
): [name: string, value: string][] {
  const withValue = getWith(attributes, file);
  return [
    ...(withValue === undefined
      ? []
      : [['with', withValue] as [string, string]]),
    ...(attributes.id === undefined
      ? []
      : [['id', attributes.id] as [string, string]]),
    ...(attributes.classes.length === 0
      ? []
      : [['className', attributes.classes.join(' ')] as [string, string]]),
    ...[...attributes.attributes].filter(([name]) => name !== 'with'),
  ];
}

function transform(parent: Parents, file: VFile, inNotes: boolean) {
  if (parent.type === 'listItem') {
    // The directive applies to the whole item if it's in its first line.
    const [first] = parent.children;
    const directive =
      first?.type === 'paragraph'
        ? takeDirective(first.children, 'step')
        : undefined;
    if (directive !== undefined) {
      parent.data = {
        ...parent.data,
        hProperties: {
          ...parent.data?.hProperties,
          [STEP_PROPERTY]: JSON.stringify(
            Object.fromEntries(getStepProps(getAttributes(directive), file)),
          ),
        },
      };
    }
  }
  parent.children = parent.children.map((child) => {
    if ('children' in child) {
      transform(
        child,
        file,
        inNotes || (child.type === 'mdxJsxFlowElement' && child.name === NOTES),
      );
    }
    if (child.type !== 'paragraph') {
      return child;
    }
    const directive = takeDirective(child.children, 'step');
    // Paragraphs of list items are part of the step of the item, notes
    // aren't on the slide, and labels of container directives are for their
    // components.
    if (
      directive === undefined &&
      (parent.type === 'listItem' ||
        inNotes ||
        child.data?.directiveLabel === true)
    ) {
      return child;
    }
    const step: MdxJsxFlowElement = {
      type: 'mdxJsxFlowElement',
      name: PARAGRAPH,
      attributes:
        directive === undefined
          ? []
          : [
              { type: 'mdxJsxAttribute', name: 'step', value: null },
              ...getStepProps(getAttributes(directive), file).map(
                ([name, value]) => createStringAttribute(name, value),
              ),
            ],
      // MDX compiles phrasing content in flow elements as expected.
      children: child.children as unknown as MdxJsxFlowElement['children'],
      data: EXPLICIT_JSX,
    };
    if (child.position !== undefined) {
      step.position = child.position;
    }
    return step;
  });
}

/**
 * Turns `:step` text directives (parsed by `remark-directive`) into steps:
 *
 * - In the first line of a list item, at its start or its end, e.g.,
 *   `- :step Item`, the directive sets the props of the step of the item (see
 *   {@link rehypeListSteps}).
 * - Elsewhere in a paragraph, the paragraph becomes a step of its own.
 *
 * Paragraphs on slides are `Paragraph`s, which are shown with the previous
 * step unless they have a `:step`.
 *
 * The attributes of the directive are the props of the step, e.g.,
 * `:step{with=initial group=name}`.
 */
export function remarkSteps(): (tree: Root, file: VFile) => void {
  return (tree, file) => {
    transform(tree, file, false);
  };
}
