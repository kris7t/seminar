import { parseSync } from 'vite';

const CORE_PACKAGE = '@seminar/core';
const DEFINITIONS: ReadonlySet<string> = new Set([
  'defineSlideStore',
  'defineDeckStore',
]);

interface AstNode {
  type: string;
  start: number;
  end: number;
  body?: AstNode[];
  source?: { value?: unknown };
  specifiers?: AstNode[];
  imported?: { name?: unknown };
  local?: { name: string };
  init?: unknown;
  id?: { name?: unknown };
  callee?: { type: string; name?: string };
  arguments?: AstNode[];
}

function isNode(value: unknown): value is AstNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string'
  );
}

/** Calls `visit` with each node below `node` and the node that contains it. */
function walk(
  node: AstNode,
  visit: (node: AstNode, parent: AstNode) => void,
): void {
  for (const value of Object.values(node)) {
    for (const child of Array.isArray(value) ? value : [value]) {
      if (isNode(child)) {
        visit(child, node);
        walk(child, visit);
      }
    }
  }
}

/** The local names of the functions that define stores. */
function definitionNames(program: AstNode): ReadonlySet<string> {
  const names = new Set<string>();
  for (const statement of program.body ?? []) {
    if (
      statement.type !== 'ImportDeclaration' ||
      statement.source?.value !== CORE_PACKAGE
    ) {
      continue;
    }
    for (const specifier of statement.specifiers ?? []) {
      const imported = specifier.imported?.name;
      if (
        typeof imported === 'string' &&
        DEFINITIONS.has(imported) &&
        specifier.local !== undefined
      ) {
        names.add(specifier.local.name);
      }
    }
  }
  return names;
}

/** The name of the variable that holds the result of a call, if any. */
function variableName(call: AstNode, parent: AstNode): string | undefined {
  if (parent.type === 'ExportDefaultDeclaration') return 'default';
  if (parent.type !== 'VariableDeclarator' || parent.init !== call)
    return undefined;
  const name = parent.id?.name;
  return typeof name === 'string' ? name : undefined;
}

/**
 * Returns the JavaScript module at `id` with an `id` option for each store it
 * defines with `@seminar/core`, from the path of the module and the name of
 * the variable of the store, or `undefined` if it defines none. The ids stay
 * the same when the module changes, unless the variable is renamed.
 */
export function identifyStores(code: string, id: string): string | undefined {
  if (!code.includes(CORE_PACKAGE)) return undefined;
  const { program, errors } = parseSync(id, code, { lang: 'jsx' });
  // Not JavaScript, e.g., a style sheet.
  if (errors.length > 0) return undefined;
  const root = program as unknown as AstNode;
  const names = definitionNames(root);
  if (names.size === 0) return undefined;
  const module = id.replace(/\?.*$/, '');
  const counts = new Map<string, number>();
  const edits: { start: number; end: number; text: string }[] = [];
  walk(root, (node, parent) => {
    if (node.type !== 'CallExpression') return;
    if (
      node.callee?.type !== 'Identifier' ||
      !names.has(node.callee.name ?? '')
    )
      return;
    const name = variableName(node, parent) ?? '';
    const count = (counts.get(name) ?? 0) + 1;
    counts.set(name, count);
    const option = `id: ${JSON.stringify(`${module}#${name}#${String(count)}`)}`;
    const options = node.arguments?.[0];
    if (options === undefined) {
      edits.push({
        start: node.end - 1,
        end: node.end - 1,
        text: `{ ${option} }`,
      });
    } else {
      edits.push(
        { start: options.start, end: options.start, text: '{ ...(' },
        { start: options.end, end: options.end, text: `), ${option} }` },
      );
    }
  });
  if (edits.length === 0) return undefined;
  return edits
    .sort((a, b) => b.start - a.start)
    .reduce(
      (result, { start, end, text }) =>
        result.slice(0, start) + text + result.slice(end),
      code,
    );
}
