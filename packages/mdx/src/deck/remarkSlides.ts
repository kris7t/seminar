import type { Declaration, Program } from 'estree';
import GithubSlugger from 'github-slugger';
import type { Root, RootContent } from 'mdast';
import type { MdxJsxFlowElement } from 'mdast-util-mdx';
import type { VFile } from 'vfile';

import {
  DECK,
  EXPLICIT_JSX,
  FORMULA,
  NOTES,
  SLIDE,
  STEP,
  SLIDE_ELEMENT,
  THEME,
} from '../utils/jsx.ts';
import {
  createEsm,
  createExpressionAttribute,
  createSpreadAttribute,
  createStringAttribute,
} from '../utils/estree.ts';
import {
  CORE_UI_LOCALES,
  getDeckLang,
  getUiLocaleSources,
  type UiLocaleSource,
} from './uiLocales.ts';
import { getDeckFrontmatter, type DeckDefaults } from './frontmatter.ts';
import {
  expandSelfIncludes,
  includeSlides,
  type IncludeContext,
} from './includes.ts';
import { SLIDE_TITLE_MARKER } from './marker.ts';
import {
  buildSlides,
  createToc,
  finishSlides,
  resolveDivisionIds,
  resolveSpares,
  isStepBound,
  STEP_BOUNDS,
  type SlideDraft,
  type TocEntry,
} from './slideDrafts.ts';

export interface RemarkSlidesOptions extends DeckDefaults {
  /** Module to import the components of decks from. */
  importSource?: string | undefined;
  /**
   * Tells that the deck at `deckPath` depends on another file at compile
   * time, e.g., a deck it includes slides from, so that it can be watched.
   */
  onDependency?: ((deckPath: string, dependency: string) => void) | undefined;
}

/**
 * Props of the slides of other decks that included slides set, which are
 * reset if they don't, since the slides have the props of the other deck.
 */
const INCLUDE_OVERRIDES = [
  'id',
  'spare',
  'aliases',
  'fromLast',
  ...STEP_BOUNDS,
] as const;

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
    recap,
    include,
    fromLast,
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
  for (const bound of STEP_BOUNDS) {
    const value = attributes.get(bound);
    if (value !== undefined && !isStepBound(value)) {
      file.message(
        `Expected \`${bound}\` to be a step path like \`2\`, \`1.1\`, or \`group.1\`, not \`${value}\``,
        { place },
      );
    }
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
    // Included slides are rendered by the component imported for them.
    name: include ?? SLIDE,
    data: EXPLICIT_JSX,
    attributes: [
      // Recaps and included slides take the master from the slide they show.
      ...(recap !== undefined
        ? [createStringAttribute('recap', recap)]
        : include === undefined
          ? [masterAttribute]
          : []),
      ...(spare === true ? [createExpressionAttribute('spare', 'true')] : []),
      ...(fromLast === true
        ? [createExpressionAttribute('fromLast', 'true')]
        : []),
      // Included slides have the props of their slide in the other deck, so
      // the props that may differ are reset.
      ...(include === undefined
        ? []
        : INCLUDE_OVERRIDES.filter(
            (name) =>
              !props.has(name) &&
              !(name === 'spare' && spare === true) &&
              !(name === 'fromLast' && fromLast === true) &&
              !(name === 'aliases' && aliases !== undefined),
          ).map((name) => createExpressionAttribute(name, 'undefined'))),
      ...(aliases === undefined
        ? []
        : [createExpressionAttribute('aliases', JSON.stringify(aliases))]),
      ...[...props].map(([name, value]) => createStringAttribute(name, value)),
    ],
    children: [...titleElement, ...(children as MdxJsxFlowElement['children'])],
  };
}

/** The name of the import of the language of the user interface at `index`. */
function uiLocaleName(index: number): string {
  return `_SliderUiLocale${String(index)}`;
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
  lang: string,
  uiLocales: readonly UiLocaleSource[],
  file: VFile,
): MdxJsxFlowElement['attributes'] {
  const attributes: MdxJsxFlowElement['attributes'] = [
    createExpressionAttribute('toc', JSON.stringify(toc)),
    createExpressionAttribute('lang', JSON.stringify(lang)),
    createExpressionAttribute(
      'uiLocales',
      `[${uiLocales
        .map(({ lang: uiLang, module }, index) =>
          module === undefined
            ? uiLocaleName(index)
            : `{ lang: ${JSON.stringify(uiLang)}, catalog: ${uiLocaleName(index)} }`,
        )
        .join(', ')}]`,
    ),
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
  onDependency,
  ...defaults
}: RemarkSlidesOptions = {}): (tree: Root, file: VFile) => void {
  return (tree, file) => {
    const slugger = new GithubSlugger();
    const esm: RootContent[] = [];
    const frontmatter = getDeckFrontmatter(tree, file, defaults);
    const depth = frontmatter['depth'] as number;
    const lang = getDeckLang(frontmatter, file);
    // Read by `rehypeMath`.
    (file.data as { sliderFrontmatter?: unknown }).sliderFrontmatter =
      frontmatter;
    const includeEsm: RootContent[] = [];
    const includeContext: IncludeContext = {
      file,
      depth,
      lang,
      esm: includeEsm,
      imports: { count: 0 },
      stack: [],
      shown: new Map(),
      onDependency:
        onDependency === undefined || file.history.length === 0
          ? undefined
          : (dependency) => {
              onDependency(file.path, dependency);
            },
    };
    const slides = buildSlides(tree.children, {
      file,
      depth,
      slugger,
      esm,
      onInclude: (directive) => includeSlides(directive, includeContext),
    });
    expandSelfIncludes(slides, file, depth);
    finishSlides(slides, slugger);
    resolveSpares(slides, depth, file);
    resolveDivisionIds(slides, depth);
    const bindings = collectBindings(esm);
    const themeSource = getThemeSource(frontmatter, file);
    const uiLocales = getUiLocaleSources(frontmatter, lang, file);
    // The languages of the core come with the components, and the others
    // from their own modules.
    const coreLocales = uiLocales.flatMap(({ lang: uiLang, module }, index) =>
      module === undefined
        ? [`${CORE_UI_LOCALES.get(uiLang) ?? ''} as ${uiLocaleName(index)}`]
        : [],
    );
    const deck: MdxJsxFlowElement = {
      type: 'mdxJsxFlowElement',
      name: DECK,
      data: EXPLICIT_JSX,
      attributes: createDeckAttributes(
        frontmatter,
        themeSource,
        createToc(slides, depth),
        lang,
        uiLocales,
        file,
      ),
      children: slides
        .filter(({ noSlide }) => noSlide !== true)
        .map((slide) => createSlideElement(slide, bindings, file)),
    };
    tree.children = [
      createEsm(
        `import { ${[
          `Deck as ${DECK}`,
          `Slide as ${SLIDE}`,
          `Step as ${STEP}`,
          `SlideElement as ${SLIDE_ELEMENT}`,
          `Formula as ${FORMULA}`,
          `Notes as ${NOTES}`,
          ...coreLocales,
        ].join(', ')} } from ${JSON.stringify(importSource)};`,
      ),
      ...(themeSource === undefined
        ? []
        : [createEsm(`import ${THEME} from ${JSON.stringify(themeSource)};`)]),
      ...uiLocales.flatMap(({ module }, index) =>
        module === undefined
          ? []
          : [
              createEsm(
                `import ${uiLocaleName(index)} from ${JSON.stringify(module)};`,
              ),
            ],
      ),
      createEsm(`export const frontmatter = ${JSON.stringify(frontmatter)};`),
      ...includeEsm,
      ...esm,
      deck,
    ];
  };
}
