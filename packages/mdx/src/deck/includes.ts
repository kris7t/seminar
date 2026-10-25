import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import GithubSlugger from 'github-slugger';
import type { RootContent } from 'mdast';
import type { LeafDirective } from 'mdast-util-directive';
import { toString } from 'mdast-util-to-string';
import type { VFile } from 'vfile';

import { getAttributes } from '../directives/directives.ts';
import { createEsm } from '../utils/estree.ts';
import { EXPLICIT_JSX, NOTES } from '../utils/jsx.ts';
import { getDeckFrontmatter, parseDeck } from './frontmatter.ts';
import type { PluggableList } from 'unified';
import { getDeckLang } from './uiLocales.ts';
import {
  notesExportName,
  slideExportName,
  titleExportName,
} from './recmaSlideExports.ts';
import {
  buildSlides,
  createSlide,
  finishSlides,
  resolveDivisionIds,
  STEP_BOUNDS,
  structureLevels,
  type SlideDraft,
} from './slideDrafts.ts';

/** Where `::include` directives are, and where their imports go. */
export interface IncludeContext {
  /** The deck with the directives. */
  file: VFile;
  /** The depth of the deck, see `getDeckFrontmatter`. */
  depth: number;
  /** The language of the deck, see `getDeckLang`. */
  lang: string;
  /** Collects the imports of the included slides. */
  esm: RootContent[];
  /** Counts the imported slides, to name them. */
  imports: { count: number };
  /** The decks being included, to detect includes in a cycle. */
  stack: readonly string[];
  /** Tells that the deck depends on another file, e.g., to watch it. */
  onDependency?: ((dependency: string) => void) | undefined;
  /**
   * The slides that show each included slide first, by its origin (see
   * `SlideDraft`), which later includes of the slide recap.
   */
  shown: Map<string, SlideDraft>;
  /** Plugins that extend the syntax of decks, to parse included decks. */
  syntaxPlugins?: PluggableList | undefined;
}

/** The slides of an included deck, as {@link buildSlides} creates them. */
export interface DeckStructure {
  depth: number;
  /** The language of the deck. */
  lang: string;
  /** The slides, including divisions without slides. */
  slides: SlideDraft[];
  /** The index of the exported component of each slide that has one. */
  exports: Map<SlideDraft, number>;
}

/**
 * Gives recaps without an id the id that the `Deck` derives for them, e.g.,
 * `intro-recap`, so that they can be included by it.
 */
function deriveRecapIds(slides: readonly SlideDraft[]) {
  const emitted = slides.filter(({ noSlide }) => noSlide !== true);
  const used = new Set(
    emitted.flatMap(({ id }) => (id === undefined ? [] : [id])),
  );
  for (const slide of emitted) {
    if (slide.recap === undefined || slide.id !== undefined) {
      continue;
    }
    const original = findOriginal(emitted, slide);
    const base = original?.id;
    if (base === undefined) {
      continue;
    }
    let id = `${base}-recap`;
    for (let n = 2; used.has(id); n += 1) {
      id = `${base}-recap-${String(n)}`;
    }
    used.add(id);
    slide.id = id;
  }
}

/** Finds the slide with `id` among `slides`, or the slide it's an alias of. */
function findSlide(
  slides: readonly SlideDraft[],
  id: string,
): SlideDraft | undefined {
  return (
    slides.find((slide) => slide.id === id && slide.noSlide !== true) ??
    slides.find((slide) => slide.aliases?.includes(id) === true)
  );
}

/** Finds the slide that `slide` recaps, following recaps of recaps. */
function findOriginal(
  slides: readonly SlideDraft[],
  slide: SlideDraft,
): SlideDraft | undefined {
  const visited = new Set<SlideDraft>();
  let current = slide;
  while (current.recap !== undefined) {
    visited.add(current);
    const target = findSlide(slides, current.recap);
    if (target === undefined || visited.has(target)) {
      return undefined;
    }
    current = target;
  }
  return current;
}

/**
 * Reads the slides of the deck at `deckPath`, as another deck includes them,
 * where only the `stack`, `onDependency`, and `syntaxPlugins` of `context`
 * matter.
 */
export function readStructure(
  deckPath: string,
  context: IncludeContext,
): DeckStructure {
  context.onDependency?.(deckPath);
  const { tree, file } = parseDeck(
    readFileSync(deckPath, 'utf8'),
    deckPath,
    context.syntaxPlugins,
  );
  const frontmatter = getDeckFrontmatter(tree, file);
  const depth = frontmatter['depth'] as number;
  const lang = getDeckLang(frontmatter, file);
  const nested: IncludeContext = {
    file,
    depth,
    lang,
    // The included deck imports the slides it includes itself.
    esm: [],
    imports: { count: 0 },
    stack: [...context.stack, deckPath],
    onDependency: context.onDependency,
    shown: new Map(),
    syntaxPlugins: context.syntaxPlugins,
  };
  const slugger = new GithubSlugger();
  // Like `remarkSlides`, so that the slides are those of the compiled deck.
  const slides = buildSlides(tree.children, {
    file,
    depth,
    slugger,
    esm: [],
    onInclude: (directive) => includeSlides(directive, nested),
  });
  expandSelfIncludes(slides, file, depth);
  finishSlides(slides, slugger);
  resolveDivisionIds(slides, depth);
  deriveRecapIds(slides);
  const exports = new Map<SlideDraft, number>();
  for (const slide of slides) {
    if (slide.noSlide !== true) {
      // Slides included by the deck keep where they come from.
      slide.origin ??= `${deckPath}#${String(exports.size)}`;
      exports.set(slide, exports.size);
    }
  }
  return { depth, lang, slides, exports };
}

/** Resolves the module `specifier` imported by the deck at `from`. */
function resolveDeck(specifier: string, from: string): string {
  return specifier.startsWith('./') || specifier.startsWith('../')
    ? path.resolve(path.dirname(from), specifier)
    : createRequire(from).resolve(specifier);
}

/** Copies the range of steps among `attributes` to `slide`. */
function copyRange(
  slide: SlideDraft,
  attributes: ReadonlyMap<string, string>,
  bounds: readonly string[] = STEP_BOUNDS,
) {
  for (const bound of bounds) {
    const value = attributes.get(bound);
    if (value !== undefined) {
      slide.attributes.set(bound, value);
    }
  }
}

const START_BOUNDS = ['from', 'after'] as const;

const END_BOUNDS = ['to', 'before'] as const;

function hasAny(
  attributes: ReadonlyMap<string, string>,
  keys: readonly string[],
): boolean {
  return keys.some((key) => attributes.has(key));
}

/**
 * Sets the start of the range of `slide`, a recap at `index` of `slides`, to
 * where the previous showing of the slide it recaps ended, like the `Deck`
 * does for recaps.
 */
function setRecapStart(
  slide: SlideDraft,
  slides: readonly SlideDraft[],
  index: number,
  original: SlideDraft,
) {
  const recap = slides[index];
  if (recap === undefined || hasAny(recap.attributes, START_BOUNDS)) {
    return;
  }
  const previous = slides
    .slice(0, index)
    .filter(
      (other) =>
        other.noSlide !== true &&
        (other === original ||
          (other.recap !== undefined &&
            findOriginal(slides, other) === original)),
    )
    .at(-1);
  if (previous === undefined) {
    return;
  }
  const to = previous.attributes.get('to');
  const before = previous.attributes.get('before');
  if (to !== undefined) {
    slide.attributes.set('after', to);
  } else if (before !== undefined) {
    slide.attributes.set('from', before);
  } else {
    slide.fromLast = true;
  }
}

/**
 * Whether `slide` has presenter notes, written with `:::notes`, or included
 * with the slide from another deck.
 */
function hasNotes(slide: SlideDraft): boolean {
  return slide.children.some(
    (child) =>
      (child.type === 'containerDirective' && child.name === 'notes') ||
      (child.type === 'mdxJsxFlowElement' && child.name === NOTES),
  );
}

/** Returns the title of `slide` as text, for the table of contents. */
function titleText(slide: SlideDraft): string | undefined {
  if (slide.tocTitle !== undefined || slide.tocText !== undefined) {
    return slide.tocTitle ?? slide.tocText;
  }
  return slide.title === undefined
    ? undefined
    : toString({ type: 'paragraph', children: slide.title });
}

/** Attributes of `::include` by the form of the directive. */
const CONTENT_ATTRIBUTES = new Set([
  'title',
  'spare',
  'copy',
  'lang',
  ...STEP_BOUNDS,
]);

const DIVISION_ATTRIBUTES = new Set(['title', 'spare', 'copy', ...STEP_BOUNDS]);

const RANGE_ATTRIBUTES = new Set<string>(['copy', ...STEP_BOUNDS]);

/**
 * Includes slides of another deck for an `::include` directive:
 *
 * - `::include[./deck.deck.mdx#id]` includes the slide `id`, e.g., a content
 *   slide, with the id, title in the table of contents, range of steps, and
 *   `spare` of the directive, if given. A recap is included as a slide, with
 *   the range of steps it would have as a recap.
 * - If `id` is a division, e.g., a section, it includes the division with its
 *   slides, keeping their ranges of steps and recaps, and `spare` on them. The
 *   directive sets the id, title, and `spare` of the division.
 * - `::include[./deck.deck.mdx]` includes the whole deck, or the slides from
 *   `from=id` or `after=id` to `to=id` or `before=id`, where `after` and `to`
 *   include the slides in a division, too.
 *
 * When a recap is included without the slide it recaps, the first recap of
 * the slide is included as a slide, and the others recap that one.
 *
 * A slide is only included once: later includes of it, by this or other
 * directives, e.g., in overlapping ranges, or in decks that include the same
 * slide, recap it, with their own ranges of steps, and continue where the
 * previous showing ended without one. With `copy`, the directive includes
 * the slides as new slides instead, which other directives don't recap.
 *
 * The path is resolved like an import of the deck, e.g., relative to it or
 * from a package, and the slides are imported from the compiled deck, where
 * they resolve their own imports, so that the bundler only keeps the included
 * slides. The deck depends on the included deck at compile time, too, to read
 * its slides.
 */
export function includeSlides(
  directive: LeafDirective,
  context: IncludeContext,
): SlideDraft[] {
  const { file } = context;
  const place = directive.position;
  const label = toString(directive).trim();
  const hash = label.lastIndexOf('#');
  const specifier = hash < 0 ? label : label.slice(0, hash);
  const targetId = hash < 0 ? undefined : label.slice(hash + 1);
  if (targetId === '' || (specifier === '' && targetId === undefined)) {
    file.message(
      'Expected `::include` to refer to a deck, e.g., `::include[./talk.deck.mdx#intro]`',
      { place },
    );
    return [];
  }
  /** Includes slides of this deck once all of them are known. */
  const includeSelf = () => {
    const placeholder = createSlide('content', undefined, undefined);
    placeholder.selfInclude = directive;
    return [placeholder];
  };
  if (specifier === '' || specifier === '.') {
    return includeSelf();
  }
  // Documents without a path are resolved against the working directory.
  const from =
    file.history.length === 0
      ? path.join(file.cwd, 'index.mdx')
      : path.resolve(file.cwd, file.path);
  let deckPath: string;
  let structure: DeckStructure;
  try {
    deckPath = resolveDeck(specifier, from);
    if (deckPath === from) {
      return includeSelf();
    }
    if (context.stack.includes(deckPath)) {
      file.message(`Can't include \`${specifier}\`, which includes this deck`, {
        place,
      });
      return [];
    }
    structure = readStructure(deckPath, context);
  } catch (error) {
    file.message(`Can't include \`${specifier}\`: ${String(error)}`, {
      place,
    });
    return [];
  }
  const { slides: source, exports, depth, lang: deckLang } = structure;
  const { id, classes, attributes } = getAttributes(directive);
  const copy = attributes.get('copy');
  const isCopy = copy === '' || copy === 'true';

  // Imports each component once.
  const imported = new Map<number, string>();
  const importSlide = (slide: SlideDraft): string | undefined => {
    const index = exports.get(slide);
    if (index === undefined) {
      return undefined;
    }
    let name = imported.get(index);
    if (name === undefined) {
      name = `_SeminarInclude${String(context.imports.count)}`;
      context.imports.count += 1;
      imported.set(index, name);
      context.esm.push(
        createEsm(
          `import { ${slideExportName(index)} as ${name} } from ${JSON.stringify(specifier)};`,
        ),
      );
    }
    return name;
  };
  /** Imports the component of the title of `slide`, if it has one. */
  const importTitle = (slide: SlideDraft): string | undefined => {
    const index = exports.get(slide);
    if (index === undefined || slide.title === undefined) {
      return undefined;
    }
    const name = `_SeminarIncludeTitle${String(context.imports.count)}`;
    context.imports.count += 1;
    context.esm.push(
      createEsm(
        `import { ${titleExportName(index)} as ${name} } from ${JSON.stringify(specifier)};`,
      ),
    );
    return name;
  };
  /** Imports the component of the notes of `slide`, if it has any. */
  const importNotes = (slide: SlideDraft): string | undefined => {
    const index = exports.get(slide);
    if (index === undefined || !hasNotes(slide)) {
      return undefined;
    }
    const name = `_SeminarIncludeNotes${String(context.imports.count)}`;
    context.imports.count += 1;
    context.esm.push(
      createEsm(
        `import { ${notesExportName(index)} as ${name} } from ${JSON.stringify(specifier)};`,
      ),
    );
    return name;
  };
  // Divisions keep their levels, e.g., sections stay sections, whatever the
  // depth of this deck, while other slides are content slides of this deck.
  const levelOf = (slide: SlideDraft) =>
    slide.division === true ? slide.level : undefined;
  /**
   * Shows `rendered` for `slide`, which is either the slide itself or a recap
   * of it, as a slide, or as a recap of the slide that already shows it.
   *
   * @returns The slide, and whether it's a recap.
   */
  const show = (
    slide: SlideDraft,
    rendered: SlideDraft,
    slideId: string | undefined,
    recapId: string | undefined,
  ): { draft: SlideDraft; isRecap: boolean } => {
    const { origin } = rendered;
    const shown =
      isCopy || origin === undefined ? undefined : context.shown.get(origin);
    if (shown !== undefined) {
      const draft = createSlide('content', recapId, undefined);
      draft.recapTarget = shown;
      draft.place = place;
      return { draft, isRecap: true };
    }
    const draft = createSlide('content', slideId, undefined);
    const name = importSlide(rendered);
    if (name !== undefined) {
      draft.include = name;
    }
    draft.origin = origin;
    // Read out in the language of the other deck, or its own.
    const slideLang = rendered.attributes.get('lang') ?? deckLang;
    if (slideLang !== context.lang) {
      draft.attributes.set('lang', slideLang);
    }
    // The title of the slide, rendered by the other deck, e.g., for the table
    // of contents.
    const title = importTitle(rendered);
    if (title !== undefined) {
      draft.title = [
        {
          type: 'mdxJsxTextElement',
          name: title,
          attributes: [],
          children: [],
        },
      ];
    }
    // The notes of the slide, rendered by the other deck.
    const notes = importNotes(rendered);
    if (notes !== undefined) {
      draft.children = [
        {
          type: 'mdxJsxFlowElement',
          name: NOTES,
          attributes: [],
          data: EXPLICIT_JSX,
          children: [
            {
              type: 'mdxJsxFlowElement',
              name: notes,
              attributes: [],
              data: EXPLICIT_JSX,
              children: [],
            },
          ],
        },
      ];
    }
    draft.tocText = titleText(slide.recap === undefined ? slide : rendered);
    draft.place = place;
    if (!isCopy && origin !== undefined) {
      context.shown.set(origin, draft);
    }
    return { draft, isRecap: false };
  };
  const report = (allowed: ReadonlySet<string>, form: string) => {
    for (const attribute of [
      ...classes.map((name) => `.${name}`),
      ...[...attributes.keys()].filter((key) => !allowed.has(key)),
    ]) {
      file.message(`Ignoring \`${attribute}\` on \`::include\` of ${form}`, {
        place,
      });
    }
  };
  const findIndex = (slideId: string) => {
    const index = source.findIndex((slide) => slide.id === slideId);
    if (index < 0) {
      file.message(`Can't find the slide \`${slideId}\` in \`${specifier}\``, {
        place,
      });
    }
    return index;
  };
  const isDivision = (slide: SlideDraft) => slide.division === true;
  /** Returns the index after the division at `index`, or the slide. */
  const endOf = (index: number) => {
    const slide = source[index];
    if (slide === undefined || !isDivision(slide)) {
      return index + 1;
    }
    const levels = structureLevels(source, depth);
    const level = levels[index] ?? 0;
    const end = levels.findIndex(
      (other, otherIndex) => otherIndex > index && other <= level,
    );
    return end < 0 ? source.length : end;
  };

  if (targetId !== undefined) {
    const index = findIndex(targetId);
    const target = source[index];
    if (target === undefined) {
      return [];
    }
    if (!isDivision(target)) {
      // A single slide, at the level of content slides.
      report(CONTENT_ATTRIBUTES, 'a slide');
      const original =
        target.recap === undefined ? target : findOriginal(source, target);
      if (original === undefined) {
        file.message(
          `Can't find the slide that \`${targetId}\` in \`${specifier}\` recaps`,
          { place },
        );
        return [];
      }
      const { draft, isRecap } = show(target, original, id ?? target.id, id);
      copyRange(draft, target.attributes);
      if (target.recap !== undefined && !isRecap) {
        setRecapStart(draft, source, index, original);
      }
      // The directive overrides the start and the end of the range.
      if (hasAny(attributes, START_BOUNDS)) {
        draft.fromLast = false;
        for (const bound of START_BOUNDS) {
          draft.attributes.delete(bound);
        }
        copyRange(draft, attributes, START_BOUNDS);
      }
      if (hasAny(attributes, END_BOUNDS)) {
        for (const bound of END_BOUNDS) {
          draft.attributes.delete(bound);
        }
        copyRange(draft, attributes, END_BOUNDS);
      }
      draft.tocTitle = attributes.get('title');
      draft.spareAttribute = attributes.get('spare');
      const lang = attributes.get('lang');
      if (lang !== undefined && !isRecap) {
        draft.attributes.set('lang', lang);
      }
      return [draft];
    }
    report(DIVISION_ATTRIBUTES, 'a division');
    for (const bound of STEP_BOUNDS) {
      if (attributes.has(bound)) {
        file.message(
          `Ignoring \`${bound}\` on \`::include\` of a division, whose slides keep their own ranges of steps`,
          { place },
        );
      }
    }
    const included = includeRange(index, endOf(index));
    const division = included[0];
    if (division !== undefined) {
      division.id = id ?? division.id;
      division.tocTitle = attributes.get('title') ?? division.tocTitle;
      // The division is spare like a slide of this deck.
      division.spareAttribute = attributes.get('spare');
    }
    return included;
  }

  report(RANGE_ATTRIBUTES, 'a deck');
  const bound = (name: (typeof STEP_BOUNDS)[number]) => {
    const value = attributes.get(name);
    if (value === undefined) {
      return undefined;
    }
    const index = findIndex(value);
    return index < 0 ? undefined : index;
  };
  const fromIndex = bound('from');
  const afterIndex = bound('after');
  const toIndex = bound('to');
  const beforeIndex = bound('before');
  const start = fromIndex ?? (afterIndex === undefined ? 0 : endOf(afterIndex));
  const end =
    toIndex === undefined ? (beforeIndex ?? source.length) : endOf(toIndex);
  return includeRange(start, end);

  /**
   * Includes the slides from `start` to `end`, keeping their structure,
   * ranges, recaps, and `spare` attributes.
   */
  function includeRange(start: number, end: number): SlideDraft[] {
    const range = source.slice(start, end);
    // The slides of this directive that show each slide, which recaps of the
    // slide among the included slides recap.
    const showing = new Map<SlideDraft, SlideDraft>();
    const drafts: SlideDraft[] = [];
    for (const [offset, slide] of range.entries()) {
      const index = start + offset;
      if (slide.noSlide === true) {
        const draft = createSlide('content', slide.id, undefined);
        draft.noSlide = true;
        draft.headingText = slide.headingText;
        draft.tocTitle = slide.tocTitle;
        draft.level = levelOf(slide);
        draft.division = slide.division === true;
        draft.spareAttribute = slide.spareAttribute;
        draft.place = place;
        drafts.push(draft);
        continue;
      }
      const original =
        slide.recap === undefined ? slide : findOriginal(source, slide);
      if (original === undefined) {
        file.message(
          `Can't find the slide that \`${slide.id ?? 'a recap'}\` in \`${specifier}\` recaps`,
          { place },
        );
        continue;
      }
      const shown = showing.get(original);
      let draft: SlideDraft;
      if (shown === undefined) {
        // The slide, the first recap of a slide outside the range, or a
        // recap of a slide that was included before.
        const result = show(
          slide,
          original,
          slide.id,
          slide.recap === undefined ? undefined : slide.id,
        );
        draft = result.draft;
        copyRange(draft, slide.attributes);
        if (slide.recap !== undefined && !result.isRecap) {
          setRecapStart(draft, source, index, original);
        }
        showing.set(original, draft);
      } else {
        // Recaps the slide among the included slides.
        draft = createSlide('content', slide.id, undefined);
        draft.recapTarget = shown;
        draft.place = place;
        copyRange(draft, slide.attributes);
      }
      // Recaps keep the structure of the included slides, too.
      draft.level = levelOf(slide);
      draft.division = slide.division === true;
      draft.tocTitle = slide.tocTitle;
      draft.spareAttribute = slide.spareAttribute;
      drafts.push(draft);
    }
    return drafts;
  }
}

/** Copies `slide`, for a copy of a slide of this deck, which has its own state. */
function copySlide(slide: SlideDraft): SlideDraft {
  const copy: SlideDraft = {
    ...slide,
    master: { ...slide.master },
    attributes: new Map(slide.attributes),
    title: structuredClone(slide.title),
    children: structuredClone(slide.children),
  };
  // Divisions without slides refer to the slide, not to the copy.
  delete copy.aliases;
  delete copy.origin;
  return copy;
}

/**
 * Recaps `slide` of this deck, repeating its range of steps, i.e., from the
 * beginning if it doesn't have a start, unlike `::recap`, which continues
 * where the previous showing ended.
 */
function repeatSlide(slide: SlideDraft): SlideDraft {
  const draft = createSlide('content', undefined, undefined);
  if (slide.recap === undefined && slide.recapTarget === undefined) {
    draft.recapTarget = slide;
  } else {
    // Recaps the slide that the recap recaps.
    if (slide.recap !== undefined) {
      draft.recap = slide.recap;
    }
    if (slide.recapTarget !== undefined) {
      draft.recapTarget = slide.recapTarget;
    }
  }
  copyRange(draft, slide.attributes);
  if (!hasAny(draft.attributes, START_BOUNDS)) {
    if (slide.fromLast === true) {
      draft.fromLast = true;
    } else {
      draft.attributes.set('from', '0');
    }
  }
  draft.tocTitle = slide.tocTitle;
  return draft;
}

/**
 * Replaces the `::include` directives of slides of this deck, e.g.,
 * `::include[#id]`, with the included slides, once all slides are built, in
 * the order of the directives. The forms are those of `includeSlides`, but
 * the slides are recapped, repeating their own ranges of steps, unlike
 * `::recap`, or copied, with their own state, with `copy`. Ranges that
 * include the directive itself are reported.
 */
export function expandSelfIncludes(
  slides: SlideDraft[],
  file: VFile,
  depth: number,
): void {
  for (let index = 0; index < slides.length; index += 1) {
    const placeholder = slides[index];
    if (placeholder?.selfInclude === undefined) {
      continue;
    }
    const included = expandSelfInclude(slides, index, file, depth);
    slides.splice(index, 1, ...included);
    index += included.length - 1;
  }
}

function expandSelfInclude(
  slides: readonly SlideDraft[],
  placeholderIndex: number,
  file: VFile,
  depth: number,
): SlideDraft[] {
  const directive = slides[placeholderIndex]?.selfInclude;
  if (directive === undefined) {
    return [];
  }
  const place = directive.position;
  const label = toString(directive).trim();
  const hash = label.lastIndexOf('#');
  const targetId = hash < 0 ? undefined : label.slice(hash + 1);
  const { id, classes, attributes } = getAttributes(directive);
  const copy = attributes.get('copy');
  const isCopy = copy === '' || copy === 'true';
  const report = (allowed: ReadonlySet<string>, form: string) => {
    for (const attribute of [
      ...classes.map((name) => `.${name}`),
      ...[...attributes.keys()].filter((key) => !allowed.has(key)),
    ]) {
      file.message(`Ignoring \`${attribute}\` on \`::include\` of ${form}`, {
        place,
      });
    }
  };
  const findIndex = (slideId: string) => {
    const index = slides.findIndex(
      (slide) => slide.id === slideId && slide.selfInclude === undefined,
    );
    if (index < 0) {
      file.message(`Can't find the slide \`${slideId}\` in this deck`, {
        place,
      });
    }
    return index;
  };
  const isDivision = (slide: SlideDraft) => slide.division === true;
  const endOf = (index: number) => {
    const slide = slides[index];
    if (slide === undefined || !isDivision(slide)) {
      return index + 1;
    }
    const levels = structureLevels(slides, depth);
    const level = levels[index] ?? 0;
    const end = levels.findIndex(
      (other, otherIndex) => otherIndex > index && other <= level,
    );
    return end < 0 ? slides.length : end;
  };
  // Divisions keep their levels, e.g., sections stay sections, whatever the
  // depth of this deck, while other slides are content slides of this deck.
  const levelOf = (slide: SlideDraft) =>
    slide.division === true ? slide.level : undefined;
  const includeRange = (start: number, end: number): SlideDraft[] => {
    if (start <= placeholderIndex && placeholderIndex < end) {
      file.message(
        "Can't include slides of this deck that contain the `::include` itself",
        { place },
      );
      return [];
    }
    // The copies of the slides, which recaps of them among the copies recap.
    const copies = new Map<SlideDraft, SlideDraft>();
    const drafts: SlideDraft[] = [];
    for (const slide of slides.slice(start, end)) {
      // Includes of this deck later in the range aren't expanded yet.
      if (slide.selfInclude !== undefined) {
        continue;
      }
      let draft: SlideDraft;
      if (slide.noSlide === true || isCopy) {
        draft = copySlide(slide);
        const original =
          slide.recapTarget ??
          (slide.recap === undefined
            ? undefined
            : findSlide(slides, slide.recap));
        const copied =
          original === undefined ? undefined : copies.get(original);
        if (copied !== undefined) {
          delete draft.recap;
          draft.recapTarget = copied;
        }
        copies.set(slide, draft);
      } else {
        draft = repeatSlide(slide);
      }
      draft.level = levelOf(slide);
      draft.division = slide.division === true;
      draft.place = place;
      drafts.push(draft);
    }
    return drafts;
  };

  if (targetId !== undefined) {
    const index = findIndex(targetId);
    const target = slides[index];
    if (target === undefined) {
      return [];
    }
    if (!isDivision(target)) {
      report(CONTENT_ATTRIBUTES, 'a slide');
      const draft = isCopy ? copySlide(target) : repeatSlide(target);
      if (isCopy) {
        draft.id = id ?? target.id;
      } else if (id !== undefined) {
        draft.id = id;
      }
      // The directive overrides the start and the end of the range.
      if (hasAny(attributes, START_BOUNDS)) {
        draft.fromLast = false;
        for (const bound of START_BOUNDS) {
          draft.attributes.delete(bound);
        }
        copyRange(draft, attributes, START_BOUNDS);
      }
      if (hasAny(attributes, END_BOUNDS)) {
        for (const bound of END_BOUNDS) {
          draft.attributes.delete(bound);
        }
        copyRange(draft, attributes, END_BOUNDS);
      }
      draft.tocTitle = attributes.get('title') ?? draft.tocTitle;
      draft.spareAttribute = attributes.get('spare');
      draft.level = undefined;
      draft.division = false;
      draft.place = place;
      return [draft];
    }
    report(DIVISION_ATTRIBUTES, 'a division');
    for (const bound of STEP_BOUNDS) {
      if (attributes.has(bound)) {
        file.message(
          `Ignoring \`${bound}\` on \`::include\` of a division, whose slides keep their own ranges of steps`,
          { place },
        );
      }
    }
    const included = includeRange(index, endOf(index));
    const division = included[0];
    if (division !== undefined) {
      if (id !== undefined) {
        division.id = id;
      }
      division.tocTitle = attributes.get('title') ?? division.tocTitle;
      division.spareAttribute = attributes.get('spare');
    }
    return included;
  }

  report(RANGE_ATTRIBUTES, 'a deck');
  const bound = (name: (typeof STEP_BOUNDS)[number]) => {
    const value = attributes.get(name);
    if (value === undefined) {
      return undefined;
    }
    const index = findIndex(value);
    return index < 0 ? undefined : index;
  };
  const fromIndex = bound('from');
  const afterIndex = bound('after');
  const toIndex = bound('to');
  const beforeIndex = bound('before');
  const start = fromIndex ?? (afterIndex === undefined ? 0 : endOf(afterIndex));
  const end =
    toIndex === undefined ? (beforeIndex ?? slides.length) : endOf(toIndex);
  return includeRange(start, end);
}
