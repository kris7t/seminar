import type {
  CallExpression,
  ImportDeclaration,
  Node,
  ObjectExpression,
  Program,
  VariableDeclaration,
} from 'estree';
import type { Root } from 'hast';
import type { Position } from 'unist';
import type { VFile } from 'vfile';

/** The attribute that takes the range of an element to its JSX call. */
const RANGE_ATTRIBUTE = '__seminarSource';

const JSX_CALLS: ReadonlySet<string> = new Set(['_jsx', '_jsxs', '_jsxDEV']);

const HELPER = '__seminarAt';

const HELPER_LOCAL = '_seminarAt';

const FILE_LOCAL = '_seminarFile';

/** Calls `visit` on `node` and the nodes in its fields, before them. */
function walk<T extends { type: string }>(
  node: T,
  visit: (node: T) => void,
): void {
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (key !== 'position') {
      for (const child of Array.isArray(value) ? value : [value]) {
        if (
          typeof child === 'object' &&
          child !== null &&
          typeof (child as { type?: unknown }).type === 'string'
        ) {
          walk(child as T, visit);
        }
      }
    }
  }
}

function formatRange({ start, end }: Position): string {
  return `${String(start.line)}:${String(start.column)}-${String(end.line)}:${String(end.column)}`;
}

/**
 * Takes the ranges of elements in the source of the deck to the JSX calls they
 * become, for {@link recmaSourceRanges}, since these lose their positions.
 */
export function rehypeSourceRanges(): (tree: Root) => void {
  return (tree) => {
    walk(
      tree as unknown as {
        type: string;
        name?: string | null;
        position?: Position;
        attributes?: unknown[];
        properties?: Record<string, unknown>;
      },
      (node) => {
        if (node.position === undefined) {
          return;
        }
        if (node.type === 'element' && node.properties !== undefined) {
          node.properties[RANGE_ATTRIBUTE] = formatRange(node.position);
        } else if (
          (node.type === 'mdxJsxFlowElement' ||
            node.type === 'mdxJsxTextElement') &&
          typeof node.name === 'string'
        ) {
          node.attributes?.push({
            type: 'mdxJsxAttribute',
            name: RANGE_ATTRIBUTE,
            value: formatRange(node.position),
          });
        }
      },
    );
  };
}

/** Removes the range from the props of a JSX call, and returns it. */
function takeRange(props: ObjectExpression): string | undefined {
  const index = props.properties.findIndex(
    (property) =>
      property.type === 'Property' &&
      ((property.key.type === 'Identifier' &&
        property.key.name === RANGE_ATTRIBUTE) ||
        (property.key.type === 'Literal' &&
          property.key.value === RANGE_ATTRIBUTE)),
  );
  const [property] = index < 0 ? [] : props.properties.splice(index, 1);
  return property?.type === 'Property' &&
    property.value.type === 'Literal' &&
    typeof property.value.value === 'string'
    ? property.value.value
    : undefined;
}

/**
 * Tells `@seminar/core` the ranges of the elements of the deck in its source,
 * by the objects of their props, so that the components of the deck get no
 * props or parents that they wouldn't have without it. See `__seminarAt`.
 *
 * Requires {@link rehypeSourceRanges}, and should run after the other recma
 * plugins, which it hides the call of the helper from.
 */
export function recmaSourceRanges({
  importSource,
}: {
  importSource: string;
}): (tree: Program, file: VFile) => void {
  return (tree, file) => {
    const told: CallExpression[] = [];
    walk(tree as Node, (node) => {
      if (
        node.type !== 'CallExpression' ||
        node.callee.type !== 'Identifier' ||
        !JSX_CALLS.has(node.callee.name)
      ) {
        return;
      }
      const [, props] = node.arguments;
      const range =
        props?.type === 'ObjectExpression' ? takeRange(props) : undefined;
      if (range === undefined) {
        return;
      }
      const call: CallExpression = { ...node };
      told.push(call);
      node.callee = { type: 'Identifier', name: HELPER_LOCAL };
      node.arguments = [
        call,
        { type: 'Literal', value: range },
        { type: 'Identifier', name: FILE_LOCAL },
      ];
    });
    if (told.length > 0) {
      const helper: ImportDeclaration = {
        type: 'ImportDeclaration',
        specifiers: [
          {
            type: 'ImportSpecifier',
            imported: { type: 'Identifier', name: HELPER },
            local: { type: 'Identifier', name: HELPER_LOCAL },
          },
        ],
        source: { type: 'Literal', value: importSource },
        attributes: [],
      };
      // The elements of slides that other decks include are in this file.
      const path: VariableDeclaration = {
        type: 'VariableDeclaration',
        kind: 'const',
        declarations: [
          {
            type: 'VariableDeclarator',
            id: { type: 'Identifier', name: FILE_LOCAL },
            init:
              file.history.length === 0
                ? { type: 'Identifier', name: 'undefined' }
                : { type: 'Literal', value: file.path },
          },
        ],
      };
      tree.body.unshift(helper, path);
    }
  };
}
