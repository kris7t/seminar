import type { Nodes, Parents, Root, RootContent } from 'mdast';
import type {
  ContainerDirective,
  LeafDirective,
  TextDirective,
} from 'mdast-util-directive';
import type { MdxJsxFlowElement, MdxJsxTextElement } from 'mdast-util-mdx';
import type { VFile } from 'vfile';

import { getAttributes } from '../directives/directives.ts';
import { createStringAttribute } from '../utils/estree.ts';
import { EXPLICIT_JSX, NOTES, PARAGRAPH, STEP } from '../utils/jsx.ts';
import { getStepProps } from './remarkSteps.ts';

type StepDirective = TextDirective | LeafDirective | ContainerDirective;

/**
 * Whether `node` is a step directive with content, i.e., not a bare `:step`
 * in the text, which makes its paragraph or list item a step instead (see
 * {@link remarkSteps}).
 */
function isStepWithContent(node: Nodes): node is StepDirective {
  return (
    ((node.type === 'textDirective' && node.children.length > 0) ||
      node.type === 'leafDirective' ||
      node.type === 'containerDirective') &&
    node.name === 'step'
  );
}

/** The content of `directive`, without the label of a container directive. */
function contentOf(directive: StepDirective, file: VFile): RootContent[] {
  if (directive.type !== 'containerDirective') {
    return directive.children;
  }
  const [first, ...rest] = directive.children;
  if (first?.type === 'paragraph' && first.data?.directiveLabel === true) {
    file.message(
      'Expected no label on `:::step`, put its content inside instead',
      first,
    );
    return rest;
  }
  return directive.children;
}

const STEP_ATTRIBUTE = {
  type: 'mdxJsxAttribute',
  name: 'step',
  value: null,
} as const;

/** Turns `directive` into a step that renders its content. */
function toStep(
  directive: StepDirective,
  file: VFile,
): MdxJsxTextElement | MdxJsxFlowElement {
  const props = getStepProps(getAttributes(directive), file).map(
    ([name, value]) => createStringAttribute(name, value),
  );
  const hasComponent = props.some(({ name }) => name === 'component');
  const withComponent = (component: string) =>
    hasComponent
      ? props
      : [createStringAttribute('component', component), ...props];
  const children = contentOf(directive, file);
  let step: MdxJsxTextElement | MdxJsxFlowElement;
  if (directive.type === 'textDirective') {
    step = {
      type: 'mdxJsxTextElement',
      name: STEP,
      attributes: withComponent('span'),
      children: children as MdxJsxTextElement['children'],
      data: EXPLICIT_JSX as MdxJsxTextElement['data'],
    };
  } else {
    // A leaf is like a paragraph with a bare `:step`, unless it's another
    // component.
    const paragraph = directive.type === 'leafDirective' && !hasComponent;
    step = {
      type: 'mdxJsxFlowElement',
      name: paragraph ? PARAGRAPH : STEP,
      attributes: paragraph
        ? [STEP_ATTRIBUTE, ...props]
        : directive.type === 'containerDirective'
          ? withComponent('div')
          : props,
      // MDX compiles phrasing content in flow elements as expected.
      children: children as MdxJsxFlowElement['children'],
      data: EXPLICIT_JSX,
    };
  }
  if (directive.position !== undefined) {
    step.position = directive.position;
  }
  return step;
}

function transform(parent: Parents, file: VFile, inNotes: boolean) {
  parent.children = parent.children.flatMap((child) => {
    if ('children' in child) {
      transform(
        child,
        file,
        inNotes || (child.type === 'mdxJsxFlowElement' && child.name === NOTES),
      );
    }
    if (!isStepWithContent(child)) {
      return [child];
    }
    // Notes aren't on the slide, so they show the content without steps.
    return inNotes ? contentOf(child, file) : [toStep(child, file)];
  });
}

/**
 * Turns step directives with content (parsed by `remark-directive`) into
 * steps that render their content:
 *
 * - `:step[text]` in the text, as a `span`,
 * - `::step[text]` as a paragraph, like a paragraph with a bare `:step`,
 * - `:::step` around blocks, as a `div`.
 *
 * `component=…` renders another element instead, e.g.,
 * `:::step{component=section}`, and the other attributes are the props of
 * the step, like those of a bare `:step` (see {@link remarkSteps}), which
 * this leaves alone.
 */
export function remarkStepDirectives(): (tree: Root, file: VFile) => void {
  return (tree, file) => {
    transform(tree, file, false);
  };
}
