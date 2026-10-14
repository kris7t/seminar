import type { Declaration, Program } from 'estree';
import GithubSlugger from 'github-slugger';
import type { Paragraph, PhrasingContent, Root, RootContent } from 'mdast';
import type { MdxJsxFlowElement } from 'mdast-util-mdx';
import { toString } from 'mdast-util-to-string';
import type { VFile } from 'vfile';

import {
  splitTrailingAttributeBlock,
  type AttributeBlock,
} from './attributes.ts';
import {
  createEsm,
  createExpressionAttribute,
  createSpreadAttribute,
  createStringAttribute,
} from './estree.ts';
import { getDeckFrontmatter, type DeckDefaults } from './frontmatter.ts';
import { SLIDE_TITLE_MARKER } from './marker.ts';

export interface RemarkSlidesOptions extends DeckDefaults {
  /** Module to import the components of decks from. */
  importSource?: string | undefined;
}

/**
 * The master of a slide: the name of a master in the theme, or of a component
 * imported (or declared) in the document.
 */
interface MasterReference {
  name: string;
  /**
   * Whether `name` refers to a component in the document if there's one with
   * that name. This is the case for `master=Name`, but not for `.name` or the
   * default masters.
   */
  mayBeComponent: boolean;
}

interface SlideDraft {
  /**
   * Whether the slide has no content so far, so that an attribute block in
   * its own paragraph still applies to it.
   */
  open: boolean;
  master: MasterReference;
  id: string | undefined;
  attributes: Map<string, string>;
  title: PhrasingContent[] | undefined;
  children: RootContent[];
}

/**
 * Marks generated JSX elements as written explicitly, like JSX in the MDX
 * source. Otherwise, MDX treats them like elements generated from Markdown,
 * which can be replaced with the `components` passed to the document. In
 * particular, the slide title marker wouldn't be compiled to a string tag.
 */
const EXPLICIT_JSX = { _mdxExplicitJsx: true } as MdxJsxFlowElement['data'];

const DECK = '_SliderDeck';
export const SLIDE = '_SliderSlide';
export const STEP = '_SliderStep';
export const FORMULA = '_SliderFormula';
const THEME = '_SliderTheme';

/**
 * Matches a slide break with an (escaped) attribute block, e.g.,
 * `*** \{#id}`, which is parsed as a paragraph.
 */
const ATTRIBUTED_BREAK_PATTERN =
  /^\s*(?:\*{3,}|-{3,}|_{3,})\s*(\{[^{}]*\})\s*$/;

/** Matches an (escaped) attribute block on its own, e.g., `\{#id}`. */
const ATTRIBUTE_BLOCK_PATTERN = /^\s*(\{[^{}]*\})\s*$/;

function createSlide(
  master: string,
  id: string | undefined,
  block: AttributeBlock | undefined,
  file: VFile,
  title?: PhrasingContent[],
): SlideDraft {
  const slide: SlideDraft = {
    open: true,
    master: { name: master, mayBeComponent: false },
    id,
    attributes: new Map<string, string>(),
    title,
    children: [],
  };
  if (block !== undefined) {
    applyAttributes(slide, block, file);
  }
  return slide;
}

/**
 * Removes a trailing attribute block from the last text of `children`.
 *
 * @returns The attribute block, if any.
 */
function extractTrailingAttributes(
  children: PhrasingContent[],
): AttributeBlock | undefined {
  const last = children.at(-1);
  if (last?.type !== 'text') {
    return undefined;
  }
  const split = splitTrailingAttributeBlock(last.value);
  if (split === undefined) {
    return undefined;
  }
  const [text, block] = split;
  if (text === '') {
    children.pop();
  } else {
    last.value = text;
  }
  return block;
}

/**
 * Returns the attribute block of a paragraph that matches `pattern`, if any.
 */
function matchAttributeBlock(
  node: Paragraph,
  pattern: RegExp,
): AttributeBlock | undefined {
  const match = pattern.exec(toString(node));
  if (match?.[1] === undefined) {
    return undefined;
  }
  return splitTrailingAttributeBlock(match[1])?.[1];
}

/** Applies a further attribute block to a slide. */
/**
 * Applies an attribute block to a slide.
 *
 * The master is set either with `master=Name`, which refers to a component
 * imported in the document if there is one, or a class like `.name`, which
 * always refers to a master in the theme.
 */
function applyAttributes(
  slide: SlideDraft,
  { id, classes, attributes }: AttributeBlock,
  file: VFile,
) {
  slide.id = id ?? slide.id;
  const masterAttribute = attributes.get('master');
  if (masterAttribute !== undefined) {
    if (classes.length > 0) {
      file.message(
        `Ignoring the class \`.${classes.join(' .')}\` in favor of \`master=${masterAttribute}\``,
      );
    }
    slide.master = { name: masterAttribute, mayBeComponent: true };
  } else if (classes.length > 0) {
    if (classes.length > 1) {
      file.message(
        `Expected a single class to select the master, got \`.${classes.join(' .')}\``,
      );
    }
    const name = classes.at(-1);
    if (name !== undefined) {
      slide.master = { name, mayBeComponent: false };
    }
  }
  for (const [key, value] of attributes) {
    if (key !== 'master') {
      slide.attributes.set(key, value);
    }
  }
}

/** Returns the names declared by an exported declaration. */
function getDeclaredNames(declaration: Declaration): string[] {
  switch (declaration.type) {
    case 'VariableDeclaration':
      return declaration.declarations.flatMap(({ id }) =>
        id.type === 'Identifier' ? [id.name] : [],
      );
    case 'FunctionDeclaration':
    case 'ClassDeclaration':
      return [declaration.id.name];
  }
}

/**
 * Collects the names that ESM in the document binds, i.e., imports and
 * exported declarations, which slides can use as masters.
 */
function collectBindings(nodes: RootContent[]): Set<string> {
  const bindings = new Set<string>();
  for (const node of nodes) {
    if (node.type !== 'mdxjsEsm') {
      continue;
    }
    // MDX nodes use the types of `estree-jsx`, which ESLint can't always
    // resolve, so use our own `estree` types.
    const statements: Program['body'] = node.data?.estree?.body ?? [];
    for (const statement of statements) {
      if (statement.type === 'ImportDeclaration') {
        for (const specifier of statement.specifiers) {
          bindings.add(specifier.local.name);
        }
      } else if (statement.type === 'ExportNamedDeclaration') {
        const { declaration } = statement;
        if (declaration) {
          for (const name of getDeclaredNames(declaration)) {
            bindings.add(name);
          }
        }
      }
    }
  }
  return bindings;
}

function createSlideElement(
  { master, id, attributes, title, children }: SlideDraft,
  bindings: Set<string>,
): MdxJsxFlowElement {
  const props = new Map(attributes);
  if (id !== undefined && !attributes.has('id')) {
    props.set('id', id);
  }
  const masterAttribute =
    master.mayBeComponent && bindings.has(master.name)
      ? createExpressionAttribute('master', master.name)
      : createStringAttribute('master', master.name);
  const titleElement: MdxJsxFlowElement[] =
    title === undefined
      ? []
      : [
          {
            type: 'mdxJsxFlowElement',
            name: SLIDE_TITLE_MARKER,
            attributes: [],
            data: EXPLICIT_JSX,
            // MDX compiles phrasing content in flow elements as expected.
            children: title as unknown as MdxJsxFlowElement['children'],
          },
        ];
  return {
    type: 'mdxJsxFlowElement',
    name: SLIDE,
    data: EXPLICIT_JSX,
    attributes: [
      masterAttribute,
      ...[...props].map(([name, value]) => createStringAttribute(name, value)),
    ],
    children: [...titleElement, ...(children as MdxJsxFlowElement['children'])],
  };
}

/** Returns the module to import the theme from, if any. */
function getThemeSource(
  frontmatter: Record<string, unknown>,
  file: VFile,
): string | undefined {
  const { theme } = frontmatter;
  if (theme === undefined) {
    return undefined;
  }
  if (typeof theme !== 'string' || theme === '') {
    file.message(
      'Expected `theme` in the frontmatter to be the module to import the theme from',
    );
    return undefined;
  }
  return theme;
}

function createDeckAttributes(
  frontmatter: Record<string, unknown>,
  themeSource: string | undefined,
  file: VFile,
): MdxJsxFlowElement['attributes'] {
  const attributes: MdxJsxFlowElement['attributes'] = [];
  const { mouseNavigation } = frontmatter;
  if (mouseNavigation !== undefined) {
    if (typeof mouseNavigation === 'boolean') {
      attributes.push(
        createExpressionAttribute(
          'defaultMouseNavigation',
          String(mouseNavigation),
        ),
      );
    } else {
      file.message(
        'Expected `mouseNavigation` in the frontmatter to be true or false',
      );
    }
  }
  // Props passed to the document override the frontmatter.
  attributes.push(createSpreadAttribute('props'));
  if (themeSource !== undefined) {
    // Also fall back to the theme of the document if the `theme` prop is
    // explicitly `undefined`.
    attributes.push(
      createExpressionAttribute('theme', `props.theme ?? ${THEME}`),
    );
  }
  return attributes;
}

/**
 * Turns an MDX document into a deck of slides.
 *
 * - `# Heading` starts a slide with the `title` master.
 * - `## Heading` starts a slide with the `content` master.
 * - A thematic break (`***` or `---`) starts a slide with the `content`
 *   master and no title. Formatters like Prettier rewrite `***` to `---`, so
 *   both are slide breaks.
 * - Content before the first slide break forms an untitled content slide.
 *
 * Slides started by headings get the slug of the heading as their id. Headings
 * and slide breaks may end with an attribute block like `\{#id .section}` (the
 * opening brace is escaped, since MDX would parse it as an expression
 * otherwise) to set the id and other props of the slide. The master of the
 * slide is set either with a class, like `.section`, which names a master in
 * the theme, or with `master=Name`, which refers to a component imported in the
 * document if there is one, and to a master in the theme otherwise.
 * The attribute block may also follow in its own paragraph, which is how
 * formatters write it after a slide break.
 *
 * The document becomes a `Deck` that receives the props of the MDX component.
 * Settings for the deck are taken from the frontmatter (which requires
 * `remark-frontmatter`), which is also exported as `frontmatter`, with
 * defaults filled in (see {@link getDeckFrontmatter}).
 *
 * If the frontmatter has a `theme`, the default export of that module (e.g.,
 * `./theme.ts` relative to the document, or a package) is the default theme of
 * the deck, which can still be overridden with the `theme` prop.
 */
export function remarkSlides({
  importSource = '@slider/core',
  ...defaults
}: RemarkSlidesOptions = {}): (tree: Root, file: VFile) => void {
  return (tree, file) => {
    const slugger = new GithubSlugger();
    const esm: RootContent[] = [];
    const slides: SlideDraft[] = [];
    const frontmatter = getDeckFrontmatter(tree, file, defaults);
    // Read by `rehypeMath`.
    (file.data as { sliderFrontmatter?: unknown }).sliderFrontmatter =
      frontmatter;
    let current: SlideDraft | undefined;

    for (const node of tree.children) {
      if (node.type === 'yaml') {
        // Already read by `getDeckFrontmatter`.
      } else if (node.type === 'mdxjsEsm') {
        esm.push(node);
      } else if (node.type === 'heading' && node.depth <= 2) {
        const block = extractTrailingAttributes(node.children);
        const slug = slugger.slug(toString(node));
        current = createSlide(
          node.depth === 1 ? 'title' : 'content',
          slug === '' ? undefined : slug,
          block,
          file,
          node.children,
        );
        slides.push(current);
      } else if (node.type === 'thematicBreak') {
        current = createSlide('content', undefined, undefined, file);
        slides.push(current);
      } else if (
        node.type === 'paragraph' &&
        matchAttributeBlock(node, ATTRIBUTED_BREAK_PATTERN) !== undefined
      ) {
        current = createSlide(
          'content',
          undefined,
          matchAttributeBlock(node, ATTRIBUTED_BREAK_PATTERN),
          file,
        );
        slides.push(current);
      } else if (
        current?.open === true &&
        node.type === 'paragraph' &&
        matchAttributeBlock(node, ATTRIBUTE_BLOCK_PATTERN) !== undefined
      ) {
        const block = matchAttributeBlock(node, ATTRIBUTE_BLOCK_PATTERN);
        if (block !== undefined) {
          applyAttributes(current, block, file);
        }
        current.open = false;
      } else {
        if (current === undefined) {
          current = createSlide('content', undefined, undefined, file);
          slides.push(current);
        }
        current.open = false;
        current.children.push(node);
      }
    }

    const bindings = collectBindings(esm);
    const themeSource = getThemeSource(frontmatter, file);
    const deck: MdxJsxFlowElement = {
      type: 'mdxJsxFlowElement',
      name: DECK,
      data: EXPLICIT_JSX,
      attributes: createDeckAttributes(frontmatter, themeSource, file),
      children: slides.map((slide) => createSlideElement(slide, bindings)),
    };
    tree.children = [
      createEsm(
        `import { Deck as ${DECK}, Slide as ${SLIDE}, Step as ${STEP}, Formula as ${FORMULA} } from ${JSON.stringify(importSource)};`,
      ),
      ...(themeSource === undefined
        ? []
        : [createEsm(`import ${THEME} from ${JSON.stringify(themeSource)};`)]),
      createEsm(`export const frontmatter = ${JSON.stringify(frontmatter)};`),
      ...esm,
      deck,
    ];
  };
}
