import type { Nodes, Parents, Root } from 'mdast';
import type { ContainerDirective } from 'mdast-util-directive';
import type { MdxJsxFlowElement } from 'mdast-util-mdx';
import type { VFile } from 'vfile';

/** Name of the `Notes` component in the compiled deck. */
export const NOTES = '_SliderNotes';

/** See {@link remarkSlides}. */
const EXPLICIT_JSX = { _mdxExplicitJsx: true } as MdxJsxFlowElement['data'];

function isNotes(node: Nodes): node is ContainerDirective {
  return node.type === 'containerDirective' && node.name === 'notes';
}

function transform(parent: Parents, file: VFile) {
  parent.children = parent.children.map((child: Nodes) => {
    if ('children' in child) {
      transform(child, file);
    }
    if (!isNotes(child)) {
      return child;
    }
    if (parent.type !== 'root') {
      file.message(
        'Expected `:::notes` at the top level of a slide, ignoring the notes',
        { place: child.position },
      );
    }
    const notes: MdxJsxFlowElement = {
      type: 'mdxJsxFlowElement',
      name: NOTES,
      attributes: [],
      children: child.children,
      data: EXPLICIT_JSX,
    };
    return notes;
  }) as typeof parent.children;
}

/**
 * Turns `:::notes` container directives (parsed by `remark-directive`) into
 * the presenter notes of their slide, i.e., the `Notes` component of
 * `@slider/core`. Notes must be at the top level of the slide.
 *
 * Other directives are left to other plugins.
 */
export function remarkNotes(): (tree: Root, file: VFile) => void {
  return (tree, file) => {
    transform(tree, file);
  };
}
