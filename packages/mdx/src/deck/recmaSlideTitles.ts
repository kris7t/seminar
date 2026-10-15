import type {
  CallExpression,
  Expression,
  Node,
  ObjectExpression,
  Program,
  Property,
  SpreadElement,
} from 'estree';

import { SLIDE_TITLE_MARKER } from './marker.ts';

function isMarkerCall(node: Node | null): node is CallExpression {
  if (node?.type !== 'CallExpression') {
    return false;
  }
  const [type] = node.arguments;
  return type?.type === 'Literal' && type.value === SLIDE_TITLE_MARKER;
}

function isProperty(
  property: Property | SpreadElement,
  name: string,
): property is Property {
  return (
    property.type === 'Property' &&
    !property.computed &&
    ((property.key.type === 'Identifier' && property.key.name === name) ||
      (property.key.type === 'Literal' && property.key.value === name))
  );
}

function getChildren(call: CallExpression): Expression {
  const props = call.arguments[1];
  if (props?.type === 'ObjectExpression') {
    const children = props.properties.find((property) =>
      isProperty(property, 'children'),
    );
    if (children !== undefined) {
      return children.value as Expression;
    }
  }
  return { type: 'Identifier', name: 'undefined' };
}

/** Moves the slide title marker among the `children` into the `title`. */
function moveTitle(props: ObjectExpression) {
  const index = props.properties.findIndex((property) =>
    isProperty(property, 'children'),
  );
  const children = props.properties[index] as Property | undefined;
  if (children === undefined) {
    return;
  }
  let marker: CallExpression | undefined;
  const { value } = children;
  if (value.type === 'ArrayExpression') {
    const markerIndex = value.elements.findIndex((element) =>
      isMarkerCall(element),
    );
    if (markerIndex < 0) {
      return;
    }
    [marker] = value.elements.splice(markerIndex, 1) as CallExpression[];
  } else if (isMarkerCall(value)) {
    marker = value;
    props.properties.splice(index, 1);
  }
  if (marker === undefined) {
    return;
  }
  props.properties.push({
    type: 'Property',
    key: { type: 'Identifier', name: 'title' },
    value: getChildren(marker),
    kind: 'init',
    method: false,
    shorthand: false,
    computed: false,
  });
}

function walk(node: unknown) {
  if (Array.isArray(node)) {
    for (const child of node) {
      walk(child);
    }
  } else if (typeof node === 'object' && node !== null) {
    if ((node as Node).type === 'ObjectExpression') {
      moveTitle(node as ObjectExpression);
    }
    for (const value of Object.values(node)) {
      walk(value);
    }
  }
}

/**
 * Turns the slide titles marked by {@link remarkSlides} into the `title` prop
 * of their slides.
 *
 * Titles are compiled by MDX like the rest of the document, e.g., using the
 * components passed to it, and moved afterwards. Requires the JSX to be
 * compiled to function calls, i.e., the `jsx` option of MDX to be `false`.
 */
export function recmaSlideTitles(): (tree: Program) => void {
  return (tree) => {
    walk(tree);
  };
}
