import type { Declaration, Program } from 'estree';
import GithubSlugger from 'github-slugger';
import type { PhrasingContent, Root, RootContent } from 'mdast';
import type { Position } from 'unist';
import type {} from 'mdast-util-directive';
import type { MdxJsxFlowElement } from 'mdast-util-mdx';
import { toString } from 'mdast-util-to-string';
import type { VFile } from 'vfile';

import {
  getAttributes,
  hasDirective,
  takeDirective,
  type Attributes,
} from '../directives/directives.ts';
import {
  DECK,
  EXPLICIT_JSX,
  FORMULA,
  NOTES,
  SLIDE,
  STEP,
  THEME,
} from '../utils/jsx.ts';
import {
  createEsm,
  createExpressionAttribute,
  createSpreadAttribute,
  createStringAttribute,
} from '../utils/estree.ts';
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
   * that name. This is the case for `master=Name`, but not for bare words or
   * the default masters.
   */
  mayBeComponent: boolean;
  /** Whether `name` is a bare word in the attributes of the slide. */
  bareWord?: boolean;
}

interface SlideDraft {
  master: MasterReference;
  id: string | undefined;
  attributes: Map<string, string>;
  title: PhrasingContent[] | undefined;
  children: RootContent[];
  /**
   * The value of the `spare` attribute, which is the empty string for the bare
   * word, if any.
   */
  spareAttribute?: string | undefined;
  /** Whether the slide is spare, set by {@link resolveSpares}. */
  spare?: boolean;
  /** Where the slide starts in the document, if known. */
  place?: Position | undefined;
  /**
   * Whether the heading only starts a division in the table of contents and
   * the overview, but no slide, because of the `noslide` attribute.
   */
  noSlide?: boolean;
  /** The text of the heading, the title of divisions without slides. */
  headingText?: string;
  /**
   * Ids of divisions without slides that refer to this slide, set by
   * {@link resolveDivisionIds}.
   */
  aliases?: string[];
  /** Title of the slide in the table of contents, if set explicitly. */
  tocTitle?: string | undefined;
  /** Level of the heading of the slide, if any. */
  level: number | undefined;
}

/** An entry of the table of contents, as in `@slider/core`. */
interface TocEntry {
  slide?: number;
  title?: string;
  children?: TocEntry[];
}

/**
 * Creates the table of contents of the deck, where the slides are nested by
 * the levels of their headings, e.g., the content slides of a section in its
 * section slide. Slides without headings, and those with headings deeper than
 * the depth, are at the level of content slides.
 * The titles are taken from the slides by the `Deck`, which also names slides
 * without titles. Headings with `noslide` get entries without slides.
 */
function createToc(slides: readonly SlideDraft[], depth: number): TocEntry[] {
  // Slides without headings are at the level of content slides.
  const contentLevel = Math.max(depth, 1);
  const toc: TocEntry[] = [];
  const stack: { level: number; entry: TocEntry }[] = [];
  let index = 0;
  for (const slide of slides) {
    // Headings deeper than the depth, e.g., with `:slide`, start content
    // slides, too.
    const level =
      slide.level !== undefined && slide.level < contentLevel
        ? slide.level
        : contentLevel;
    let entry: TocEntry;
    if (slide.noSlide === true) {
      // Titled by the heading, since there is no slide to take it from.
      entry = { title: slide.tocTitle ?? slide.headingText ?? '' };
    } else {
      entry =
        slide.tocTitle === undefined
          ? { slide: index }
          : { slide: index, title: slide.tocTitle };
      index += 1;
    }
    while ((stack.at(-1)?.level ?? 0) >= level) {
      stack.pop();
    }
    const parent = stack.at(-1)?.entry;
    if (parent === undefined) {
      toc.push(entry);
    } else {
      (parent.children ??= []).push(entry);
    }
    stack.push({ level, entry });
  }
  return toc;
}

/** Masters of the slides started by headings above the deepest level. */
const HEADING_MASTERS = ['title', 'section', 'subsection'];

/**
 * Returns the master of the slide started by a heading of `level` in a deck of
 * `depth`: the deepest level starts content slides, and the levels above it
 * start title, section, and subsection slides.
 */
function getMaster(level: number, depth: number): string {
  return level === depth
    ? 'content'
    : (HEADING_MASTERS[level - 1] ?? 'content');
}

function createSlide(
  master: string,
  id: string | undefined,
  attributes: Attributes | undefined,
  title?: PhrasingContent[],
): SlideDraft {
  const slide: SlideDraft = {
    master: { name: master, mayBeComponent: false },
    id,
    attributes: new Map<string, string>(),
    title,
    children: [],
    level: undefined,
  };
  if (attributes !== undefined) {
    applyAttributes(slide, attributes);
  }
  return slide;
}

/** Attributes that are flags of slides, which aren't passed as props. */
const FLAGS: ReadonlySet<string> = new Set(['spare', 'noslide']);

/**
 * Applies the attributes of a `:slide` directive to a slide.
 *
 * A bare word, like `section`, sets the master to a master of the theme, like
 * the shorthands of step variants. `master=Name` sets the master to a
 * component imported or declared in the document if there is one, and to a
 * master of the theme otherwise. `master=` takes precedence over bare words,
 * and of several bare words, the last one is used. Classes are passed to the
 * master as its `className`.
 */
function applyAttributes(
  slide: SlideDraft,
  { id, classes, attributes }: Attributes,
) {
  slide.id = id ?? slide.id;
  // Flags rather than masters.
  const bareWords = [...attributes]
    .filter(([key, value]) => value === '' && !FLAGS.has(key))
    .map(([key]) => key);
  slide.spareAttribute = attributes.get('spare');
  const noSlide = attributes.get('noslide');
  slide.noSlide = noSlide === '' || noSlide === 'true';
  const master = attributes.get('master');
  const bareWord = bareWords.at(-1);
  if (master !== undefined && master !== '') {
    slide.master = { name: master, mayBeComponent: true };
  } else if (bareWord !== undefined) {
    slide.master = { name: bareWord, mayBeComponent: false, bareWord: true };
  }
  if (classes.length > 0) {
    slide.attributes.set('className', classes.join(' '));
  }
  for (const [key, value] of attributes) {
    if (key === 'title') {
      slide.tocTitle = value;
    } else if (key !== 'master' && !FLAGS.has(key) && value !== '') {
      slide.attributes.set(key, value);
    }
  }
}

/**
 * Decides which slides are spare: those with `spare` or `spare=true`, and the
 * slides in a division, like a section, whose slide is spare, unless they have
 * `spare=false`, which in turn applies to the slides in their division.
 */
function resolveSpares(slides: SlideDraft[], depth: number, file: VFile) {
  // The enclosing divisions of the current slide, outermost first.
  const divisions: { level: number; spare: boolean }[] = [];
  for (const slide of slides) {
    const { level, spareAttribute, place } = slide;
    if (level !== undefined) {
      while ((divisions.at(-1)?.level ?? 0) >= level) {
        divisions.pop();
      }
    }
    let spare = divisions.at(-1)?.spare ?? false;
    if (spareAttribute === '' || spareAttribute === 'true') {
      spare = true;
    } else if (spareAttribute === 'false') {
      spare = false;
    } else if (spareAttribute !== undefined) {
      file.message(
        `Expected \`spare\` to be \`true\` or \`false\`, not \`${spareAttribute}\``,
        { place },
      );
    }
    slide.spare = spare;
    // Headings above the deepest level start divisions.
    if (level !== undefined && level < depth) {
      divisions.push({ level, spare });
    }
  }
}

/**
 * Lets the ids of divisions without slides refer to the first slide of the
 * division that isn't spare, or to its first slide if all of them are, by
 * making them aliases of that slide. Must run after {@link resolveSpares}.
 */
function resolveDivisionIds(slides: readonly SlideDraft[]) {
  for (const [index, division] of slides.entries()) {
    const { noSlide, id, level } = division;
    if (noSlide !== true || id === undefined || level === undefined) {
      continue;
    }
    const members: SlideDraft[] = [];
    for (const slide of slides.slice(index + 1)) {
      if (slide.level !== undefined && slide.level <= level) {
        break;
      }
      if (slide.noSlide !== true) {
        members.push(slide);
      }
    }
    const target = members.find(({ spare }) => spare !== true) ?? members[0];
    if (target !== undefined) {
      (target.aliases ??= []).push(id);
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
  {
    master,
    id,
    attributes,
    title,
    children,
    place,
    spare,
    aliases,
  }: SlideDraft,
  bindings: Set<string>,
  file: VFile,
): MdxJsxFlowElement {
  // Bare words only refer to masters of the theme, so this is likely a
  // mistake, e.g., `## Total {count}` instead of `## Total {String(count)}`.
  if (master.bareWord === true && bindings.has(master.name)) {
    file.message(
      `The bare word \`${master.name}\` sets the master of the slide to the master \`${master.name}\` of the theme, not to \`${master.name}\` in the document. Write \`master=${master.name}\` to use that as the master, or \`{String(${master.name})}\` to show its value in a heading.`,
      { place },
    );
  }
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
      ...(spare === true ? [createExpressionAttribute('spare', 'true')] : []),
      ...(aliases === undefined
        ? []
        : [createExpressionAttribute('aliases', JSON.stringify(aliases))]),
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
  toc: TocEntry[],
  file: VFile,
): MdxJsxFlowElement['attributes'] {
  const attributes: MdxJsxFlowElement['attributes'] = [
    createExpressionAttribute('toc', JSON.stringify(toc)),
  ];
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
 * - Headings up to the `depth` of the deck start slides. Headings of the
 *   deepest level start slides with the `content` master, and the levels above
 *   start slides with the `title`, `section`, and `subsection` masters:
 *
 *   | `depth` | `#`     | `##`      | `###`        | `####`    |
 *   | ------- | ------- | --------- | ------------ | --------- |
 *   | 0       |         |           |              |           |
 *   | 1       | content |           |              |           |
 *   | 2       | title   | content   |              |           |
 *   | 3       | title   | section   | content      |           |
 *   | 4       | title   | section   | subsection   | content   |
 *
 *   Deeper headings stay in the slides. The `depth` is taken from the
 *   frontmatter, and defaults to the deepest level of the headings of the
 *   document, but at most 4.
 * - A heading of any level with a `:slide` directive also starts a slide, with
 *   the `content` master if it's deeper than the `depth`.
 * - A thematic break (`***` or `---`) starts a slide with the `content`
 *   master and no title. Formatters like Prettier rewrite `***` to `---`, so
 *   both are slide breaks.
 * - A `::slide` leaf directive starts a slide with the `content` master, with
 *   its label as the title, if any, e.g., `::slide[Title]{#id}`.
 * - Content before the first slide break forms an untitled content slide.
 *
 * Slides with titles get the slug of the title as their id. A `:slide`
 * directive in a heading, e.g., `## Title :slide{#id .wide section}`, which
 * {@link remarkHeadingAttributes} also lets write as
 * `## Title {#id .wide section}`, or the attributes of a `::slide`
 * directive set the id and other props of the slide:
 *
 * - A bare word, like `section`, sets the master of the slide to a master of
 *   the theme. `master=Name` sets it to a component imported or declared in
 *   the document if there is one, and to a master of the theme otherwise.
 * - Classes, like `.wide`, are passed to the master as its `className`.
 * - `title="…"` sets the title of the slide in the table of contents, e.g., for
 *   slides without a title, instead of the title shown on the slide.
 * - Other attributes are passed to the slide as props, e.g., `steps=dim`.
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
    const depth = frontmatter['depth'] as number;
    // Read by `rehypeMath`.
    (file.data as { sliderFrontmatter?: unknown }).sliderFrontmatter =
      frontmatter;
    let current: SlideDraft | undefined;

    for (const node of tree.children) {
      if (node.type === 'yaml') {
        // Already read by `getDeckFrontmatter`.
      } else if (node.type === 'mdxjsEsm') {
        esm.push(node);
      } else if (
        node.type === 'heading' &&
        (node.depth <= depth || hasDirective(node.children, 'slide'))
      ) {
        const directive = takeDirective(node.children, 'slide');
        const slug = slugger.slug(toString(node));
        current = createSlide(
          getMaster(node.depth, depth),
          slug === '' ? undefined : slug,
          directive === undefined ? undefined : getAttributes(directive),
          node.children,
        );
        current.level = node.depth;
        current.place = node.position;
        if (current.noSlide === true) {
          if (node.depth < depth) {
            current.headingText = toString(node);
            if (
              current.master.mayBeComponent ||
              current.master.bareWord === true
            ) {
              file.message(
                `Ignoring the master \`${current.master.name}\` of a heading with \`noslide\`, which has no slide to lay out`,
                { place: node.position },
              );
            }
          } else {
            current.noSlide = false;
            file.message(
              'Ignoring `noslide` on a heading of a content slide, since only title, section, and subsection headings start divisions',
              { place: node.position },
            );
          }
        }
        slides.push(current);
      } else if (node.type === 'thematicBreak') {
        current = createSlide('content', undefined, undefined);
        slides.push(current);
      } else if (node.type === 'leafDirective' && node.name === 'slide') {
        const title = node.children.length > 0 ? node.children : undefined;
        const slug = title === undefined ? '' : slugger.slug(toString(node));
        current = createSlide(
          'content',
          slug === '' ? undefined : slug,
          getAttributes(node),
          title,
        );
        current.place = node.position;
        if (current.noSlide === true) {
          current.noSlide = false;
          file.message(
            'Ignoring `noslide` on `::slide`, which always starts a slide',
            { place: node.position },
          );
        }
        slides.push(current);
      } else {
        // Content after a heading without a slide gets a slide of its own.
        if (current === undefined || current.noSlide === true) {
          current = createSlide('content', undefined, undefined);
          slides.push(current);
        }
        current.children.push(node);
      }
    }

    resolveSpares(slides, depth, file);
    resolveDivisionIds(slides);
    const bindings = collectBindings(esm);
    const themeSource = getThemeSource(frontmatter, file);
    const deck: MdxJsxFlowElement = {
      type: 'mdxJsxFlowElement',
      name: DECK,
      data: EXPLICIT_JSX,
      attributes: createDeckAttributes(
        frontmatter,
        themeSource,
        createToc(slides, depth),
        file,
      ),
      children: slides
        .filter(({ noSlide }) => noSlide !== true)
        .map((slide) => createSlideElement(slide, bindings, file)),
    };
    tree.children = [
      createEsm(
        `import { Deck as ${DECK}, Slide as ${SLIDE}, Step as ${STEP}, Formula as ${FORMULA}, Notes as ${NOTES} } from ${JSON.stringify(importSource)};`,
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
