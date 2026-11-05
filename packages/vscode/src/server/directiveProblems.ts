import {
  directiveUsageMessages,
  unknownDirectiveMessage,
} from '@seminar/mdx/syntax';
import type { Nodes, Root } from 'mdast';

import { BUILT_IN } from './directiveCode.ts';
import type { DirectiveComponent } from './directiveLoader.ts';
import { readDirectiveSyntax } from './directiveSyntax.ts';

/** A problem with a directive, at the offsets of its name in the deck. */
export interface DirectiveProblem {
  start: number;
  end: number;
  message: string;
}

/**
 * Finds the directives of the deck `source` that neither Seminar nor a
 * component in `directives` handles, or that aren't written in the forms or
 * with the content that their components take, which compiling the deck warns
 * about.
 */
export function findDirectiveProblems(
  source: string,
  root: Root,
  directives: Readonly<Record<string, DirectiveComponent>>,
): DirectiveProblem[] {
  const problems: DirectiveProblem[] = [];
  const visit = (node: Nodes): void => {
    const start = node.position?.start.offset;
    if (
      (node.type === 'textDirective' ||
        node.type === 'leafDirective' ||
        node.type === 'containerDirective') &&
      start !== undefined &&
      !Object.hasOwn(BUILT_IN, node.name)
    ) {
      const component = Object.hasOwn(directives, node.name)
        ? directives[node.name]
        : undefined;
      const messages =
        component === undefined
          ? [unknownDirectiveMessage(node)].filter(
              (message) => message !== undefined,
            )
          : directiveUsageMessages(node, component);
      if (messages.length > 0) {
        const { nameStart, nameEnd } = readDirectiveSyntax(source, start);
        for (const message of messages) {
          problems.push({ start: nameStart, end: nameEnd, message });
        }
      }
    }
    if ('children' in node) {
      for (const child of node.children) {
        visit(child);
      }
    }
  };
  visit(root);
  return problems;
}
