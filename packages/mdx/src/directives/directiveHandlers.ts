import type { Element, ElementContent } from 'hast';
import type {
  ContainerDirective,
  LeafDirective,
  TextDirective,
} from 'mdast-util-directive';
import type { Handler, State } from 'mdast-util-to-hast';

/** Directives that the plugins of slider handle where they're allowed. */
const KNOWN_DIRECTIVES: ReadonlySet<string> = new Set([
  'include',
  'notes',
  'recap',
  'slide',
  'step',
]);

type Directive = ContainerDirective | LeafDirective | TextDirective;

const PREFIXES: Record<Directive['type'], string> = {
  textDirective: ':',
  leafDirective: '::',
  containerDirective: ':::',
};

/** Returns the source of `node`, or a guess if it has no position. */
function sourceOf(state: State, node: Directive): string {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  const file = state.options.file;
  // The source may have been rewritten before parsing.
  const value =
    (file?.data as { sliderSource?: string } | undefined)?.sliderSource ??
    file?.value;
  return start === undefined || end === undefined || value === undefined
    ? `${PREFIXES[node.type]}${node.name}`
    : String(value).slice(start, end);
}

function handleDirective(
  state: State,
  node: Directive,
): ElementContent | ElementContent[] | undefined {
  const { data } = node;
  // Other plugins may turn directives into elements, as usual with
  // `remark-directive`.
  if (
    data?.hName !== undefined ||
    data?.hProperties !== undefined ||
    data?.hChildren !== undefined
  ) {
    const element: Element = {
      type: 'element',
      tagName: 'div',
      properties: {},
      children: state.all(node),
    };
    state.patch(node, element);
    return state.applyData(node, element);
  }
  const file = state.options.file;
  const place = node.position;
  const syntax = `${PREFIXES[node.type]}${node.name}`;
  if (KNOWN_DIRECTIVES.has(node.name)) {
    file?.message(`Ignoring \`${syntax}\`, which isn't allowed here`, {
      place,
    });
    return node.type === 'containerDirective' ? state.all(node) : undefined;
  }
  if (node.type === 'containerDirective') {
    file?.message(`Ignoring the unknown directive \`${syntax}\``, { place });
    return state.all(node);
  }
  // A colon followed by a word, like in `10:30`, is probably not meant as a
  // directive, unless it has a label or attributes.
  if (
    node.type === 'leafDirective' ||
    node.children.length > 0 ||
    Object.keys(node.attributes ?? {}).length > 0
  ) {
    file?.message(
      `Unknown directive \`${syntax}\`, keeping it as text; write \`\\:\` for a literal colon`,
      { place },
    );
  }
  const text: ElementContent = { type: 'text', value: sourceOf(state, node) };
  return node.type === 'leafDirective'
    ? { type: 'element', tagName: 'p', properties: {}, children: [text] }
    : text;
}

/**
 * Handlers for `remark-rehype` that keep directives (parsed by
 * `remark-directive`) that no plugin turned into something else as text, since
 * they would become empty elements otherwise, e.g., `10:30` is parsed as the
 * text directive `:30`. Reports unknown directives with labels or attributes,
 * which are probably mistakes, and directives of slider in places where they
 * aren't allowed.
 *
 * Directives with `data.hName`, `data.hProperties`, or `data.hChildren`, set by
 * other plugins, become elements as usual.
 */
export const directiveHandlers: Record<Directive['type'], Handler> = {
  textDirective: handleDirective as Handler,
  leafDirective: handleDirective as Handler,
  containerDirective: handleDirective as Handler,
};
