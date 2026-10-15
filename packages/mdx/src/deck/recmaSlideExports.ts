import type {
  CallExpression,
  Expression,
  ExportNamedDeclaration,
  FunctionDeclaration,
  Node,
  ObjectExpression,
  Program,
  SpreadElement,
  Statement,
} from 'estree';

import { DECK } from '../utils/jsx.ts';

/** Prefix of the names of the components that decks export for their slides. */
export const SLIDE_EXPORT_PREFIX = '__sliderSlide';

/** Returns the name of the component of the slide at `index` of a deck. */
export function slideExportName(index: number): string {
  return `${SLIDE_EXPORT_PREFIX}${String(index)}`;
}

/**
 * Returns the name of the component of the title of the slide at `index` of
 * a deck, which slides with titles have.
 */
export function titleExportName(index: number): string {
  return `__sliderTitle${String(index)}`;
}

function identifier(name: string): Expression {
  return { type: 'Identifier', name };
}

function isPropsObject(node: Node | undefined): node is ObjectExpression {
  return node?.type === 'ObjectExpression';
}

function isChildren(property: ObjectExpression['properties'][number]): boolean {
  return (
    property.type === 'Property' &&
    !property.computed &&
    ((property.key.type === 'Identifier' && property.key.name === 'children') ||
      (property.key.type === 'Literal' && property.key.value === 'children'))
  );
}

/** Finds the `children` of the call of the `Deck` in `_createMdxContent`. */
function findDeck(
  content: FunctionDeclaration,
):
  | { slides: (Expression | SpreadElement | null)[]; preamble: Statement[] }
  | undefined {
  const statements = content.body.body;
  const last = statements.at(-1);
  if (last?.type !== 'ReturnStatement') {
    return undefined;
  }
  const deck = last.argument;
  const [component, props] =
    deck?.type === 'CallExpression' ? deck.arguments : [];
  if (
    component?.type !== 'Identifier' ||
    component.name !== DECK ||
    !isPropsObject(props)
  ) {
    return undefined;
  }
  const children = props.properties.find(isChildren);
  if (children?.type !== 'Property') {
    return undefined;
  }
  if (children.value.type !== 'ArrayExpression') {
    // A single slide.
    children.value = {
      type: 'ArrayExpression',
      elements: [children.value as Expression],
    };
  }
  return {
    slides: (
      children.value as { elements: (Expression | SpreadElement | null)[] }
    ).elements,
    preamble: statements.slice(0, -1),
  };
}

/**
 * Exports a component for each slide of the deck, e.g., `__sliderSlide0`, and
 * for the title of each slide with one, e.g., `__sliderTitle0`, so
 * that other decks can include them (see `::include`), and bundlers only keep
 * the slides, and the modules they import, that are used.
 *
 * The component renders the slide with the props it gets overriding those of
 * the slide, e.g., its `id` or range of steps, and with the components of the
 * document, which can be overridden with the `components` prop like for the
 * whole document. The deck renders the components of its slides, with the
 * props of the slides, so that the `Deck` can read them.
 *
 * Requires the JSX to be compiled to function calls, i.e., the `jsx` option of
 * MDX to be `false`, and should run after {@link recmaSlideTitles}.
 */
export function recmaSlideExports(): (tree: Program) => void {
  return (tree) => {
    const contentIndex = tree.body.findIndex(
      (statement) =>
        statement.type === 'FunctionDeclaration' &&
        statement.id.name === '_createMdxContent',
    );
    const content = tree.body[contentIndex] as FunctionDeclaration | undefined;
    const deck = content === undefined ? undefined : findDeck(content);
    if (deck === undefined) {
      return;
    }
    const exports: ExportNamedDeclaration[] = [];
    for (const [index, slide] of deck.slides.entries()) {
      if (slide?.type !== 'CallExpression') {
        continue;
      }
      const [, props, ...rest] = slide.arguments;
      if (!isPropsObject(props)) {
        continue;
      }
      const name = slideExportName(index);
      // The slide, with the props of the component overriding its own.
      const rendered = structuredClone(slide);
      (rendered.arguments[1] as ObjectExpression).properties.push({
        type: 'SpreadElement',
        argument: identifier('props'),
      });
      exports.push({
        type: 'ExportNamedDeclaration',
        declaration: {
          type: 'FunctionDeclaration',
          id: { type: 'Identifier', name },
          params: [{ type: 'Identifier', name: 'props' }],
          body: {
            type: 'BlockStatement',
            body: [
              // Declares the components of the document, like `_components`.
              ...structuredClone(deck.preamble),
              { type: 'ReturnStatement', argument: rendered },
            ],
          },
          generator: false,
          async: false,
        },
        specifiers: [],
        attributes: [],
      });
      // The title, for decks that include the slide, e.g., to show it in their
      // tables of contents.
      const title = props.properties.find(
        (property) =>
          property.type === 'Property' &&
          !property.computed &&
          property.key.type === 'Identifier' &&
          property.key.name === 'title',
      );
      if (title?.type === 'Property') {
        exports.push({
          type: 'ExportNamedDeclaration',
          declaration: {
            type: 'FunctionDeclaration',
            id: { type: 'Identifier', name: titleExportName(index) },
            params: [{ type: 'Identifier', name: 'props' }],
            body: {
              type: 'BlockStatement',
              body: [
                ...structuredClone(deck.preamble),
                {
                  type: 'ReturnStatement',
                  argument: structuredClone(title.value as Expression),
                },
              ],
            },
            generator: false,
            async: false,
          },
          specifiers: [],
          attributes: [],
        });
      }
      // The deck reads the props of its slides, except their content.
      const reference: CallExpression = {
        type: 'CallExpression',
        callee: slide.callee,
        arguments: [
          identifier(name),
          {
            type: 'ObjectExpression',
            properties: [
              ...props.properties.filter((property) => !isChildren(property)),
              {
                type: 'Property',
                key: { type: 'Identifier', name: 'components' },
                value: {
                  type: 'MemberExpression',
                  object: identifier('props'),
                  property: { type: 'Identifier', name: 'components' },
                  computed: false,
                  optional: false,
                },
                kind: 'init',
                method: false,
                shorthand: false,
                computed: false,
              },
            ],
          },
          ...rest,
        ],
        optional: false,
      };
      deck.slides[index] = reference;
    }
    // With the `function-body` output format of MDX, e.g., for `evaluate`,
    // the exports are the properties of the object that the body returns.
    const result = tree.body.find(
      (statement) =>
        (statement.type as string) === 'ReturnStatement' &&
        (statement as unknown as { argument: Node | null }).argument?.type ===
          'ObjectExpression',
    ) as unknown as { argument: ObjectExpression } | undefined;
    if (result === undefined) {
      tree.body.splice(contentIndex + 1, 0, ...exports);
      return;
    }
    tree.body.splice(
      contentIndex + 1,
      0,
      ...exports.map(({ declaration }) => declaration as FunctionDeclaration),
    );
    for (const { declaration } of exports) {
      const name = (declaration as FunctionDeclaration).id.name;
      result.argument.properties.push({
        type: 'Property',
        key: { type: 'Identifier', name },
        value: identifier(name),
        kind: 'init',
        method: false,
        shorthand: true,
        computed: false,
      });
    }
  };
}
