import type { Nodes, PhrasingContent } from 'mdast';
import type { TextDirective } from 'mdast-util-directive';

/** Attributes of a directive, e.g., `:slide{#id .class key=value}`. */
export interface Attributes {
  id?: string | undefined;
  classes: string[];
  /** Other attributes, where those without a value are empty strings. */
  attributes: Map<string, string>;
}

/** Returns the attributes of a directive. */
export function getAttributes(directive: {
  attributes?: Record<string, string | null | undefined> | null | undefined;
}): Attributes {
  const result: Attributes = { classes: [], attributes: new Map() };
  for (const [key, value] of Object.entries(directive.attributes ?? {})) {
    if (value === null || value === undefined) {
      continue;
    }
    if (key === 'id') {
      result.id = value;
    } else if (key === 'class') {
      result.classes = value.split(/\s+/).filter((name) => name !== '');
    } else {
      result.attributes.set(key, value);
    }
  }
  return result;
}

function isDirective(node: Nodes, name: string): node is TextDirective {
  return node.type === 'textDirective' && node.name === name;
}

/** Whether `children` have a text directive called `name`. */
export function hasDirective(
  children: readonly PhrasingContent[],
  name: string,
): boolean {
  return children.some((child) => isDirective(child, name));
}

/**
 * Removes the first text directive called `name` from `children`, with the
 * whitespace that separated it from the text around it.
 *
 * @returns The removed directive, if any.
 */
export function takeDirective(
  children: PhrasingContent[],
  name: string,
): TextDirective | undefined {
  const index = children.findIndex((child) => isDirective(child, name));
  const directive = children[index];
  if (directive?.type !== 'textDirective') {
    return undefined;
  }
  children.splice(index, 1);
  const before = children[index - 1];
  const after = children[index];
  if (
    before?.type === 'text' &&
    (after === undefined || after.type === 'text')
  ) {
    before.value = before.value.trimEnd();
    if (after !== undefined) {
      // Keep a single space between the words around the directive.
      after.value =
        before.value === ''
          ? after.value.trimStart()
          : ` ${after.value.trimStart()}`;
    }
  } else if (after?.type === 'text' && before === undefined) {
    after.value = after.value.trimStart();
  }
  // Drop text that only separated the directive from the rest.
  for (let i = children.length - 1; i >= 0; i -= 1) {
    const child = children[i];
    if (child?.type === 'text' && child.value === '') {
      children.splice(i, 1);
    }
  }
  return directive;
}
