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
import { getDeckFrontmatter, parseDeck } from './frontmatter.ts';
import { slideExportName } from './recmaSlideExports.ts';
import {
  buildSlides,
  createSlide,
  resolveDivisionIds,
  STEP_BOUNDS,
  type SlideDraft,
} from './slideDrafts.ts';

/** Where `::include` directives are, and where their imports go. */
export interface IncludeContext {
  /** The deck with the directives. */
  file: VFile;
  /** The depth of the deck, see `getDeckFrontmatter`. */
  depth: number;
  /** Collects the imports of the included slides. */
  esm: RootContent[];
  /** Counts the imported slides, to name them. */
  imports: { count: number };
  /** The decks being included, to detect includes in a cycle. */
  stack: readonly string[];
  /** Tells that the deck depends on another file, e.g., to watch it. */
  onDependency?: ((dependency: string) => void) | undefined;
}

/** The slides of an included deck, as {@link buildSlides} creates them. */
interface DeckStructure {
  depth: number;
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

/** Reads the slides of the deck at `deckPath`. */
function readStructure(
  deckPath: string,
  context: IncludeContext,
): DeckStructure {
  context.onDependency?.(deckPath);
  const { tree, file } = parseDeck(readFileSync(deckPath, 'utf8'), deckPath);
  const depth = getDeckFrontmatter(tree, file)['depth'] as number;
  const nested: IncludeContext = {
    file,
    depth,
    // The included deck imports the slides it includes itself.
    esm: [],
    imports: { count: 0 },
    stack: [...context.stack, deckPath],
    onDependency: context.onDependency,
  };
  const slides = buildSlides(tree.children, {
    file,
    depth,
    slugger: new GithubSlugger(),
    esm: [],
    onInclude: (directive, parentLevel) =>
      includeSlides(directive, nested, parentLevel),
  });
  resolveDivisionIds(slides);
  deriveRecapIds(slides);
  const exports = new Map<SlideDraft, number>();
  for (const slide of slides) {
    if (slide.noSlide !== true) {
      exports.set(slide, exports.size);
    }
  }
  return { depth, slides, exports };
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
const CONTENT_ATTRIBUTES = new Set(['title', 'spare', ...STEP_BOUNDS]);

const DIVISION_ATTRIBUTES = new Set(['title', 'spare', ...STEP_BOUNDS]);

const RANGE_ATTRIBUTES = new Set<string>(STEP_BOUNDS);

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
 * The path is resolved like an import of the deck, e.g., relative to it or
 * from a package, and the slides are imported from the compiled deck, where
 * they resolve their own imports, so that the bundler only keeps the included
 * slides. The deck depends on the included deck at compile time, too, to read
 * its slides.
 */
export function includeSlides(
  directive: LeafDirective,
  context: IncludeContext,
  parentLevel = 0,
): SlideDraft[] {
  const { file } = context;
  const place = directive.position;
  const label = toString(directive).trim();
  const hash = label.lastIndexOf('#');
  const specifier = hash < 0 ? label : label.slice(0, hash);
  const targetId = hash < 0 ? undefined : label.slice(hash + 1);
  if (specifier === '' || targetId === '') {
    file.message(
      'Expected `::include` to refer to a deck, e.g., `::include[./talk.deck.mdx#intro]`',
      { place },
    );
    return [];
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
    if (deckPath === from || context.stack.includes(deckPath)) {
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
  const { slides: source, exports, depth } = structure;
  const group = {};
  const { id, classes, attributes } = getAttributes(directive);

  // Imports each component once.
  const imported = new Map<number, string>();
  const importSlide = (slide: SlideDraft): string | undefined => {
    const index = exports.get(slide);
    if (index === undefined) {
      return undefined;
    }
    let name = imported.get(index);
    if (name === undefined) {
      name = `_SliderInclude${String(context.imports.count)}`;
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
  // Included divisions are nested in the division of the directive, while
  // content slides stay at the level of content slides.
  let shift = 0;
  const shiftLevel = (level: number | undefined) =>
    level === undefined || level >= depth ? undefined : level + shift;
  /** Creates the included slide that renders `rendered`. */
  const include = (
    slide: SlideDraft,
    rendered: SlideDraft,
    slideId: string | undefined,
  ): SlideDraft => {
    const draft = createSlide('content', slideId, undefined);
    const name = importSlide(rendered);
    if (name !== undefined) {
      draft.include = name;
    }
    draft.tocText = titleText(slide.recap === undefined ? slide : rendered);
    draft.place = place;
    return draft;
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
  const isDivision = (slide: SlideDraft) =>
    slide.level !== undefined && slide.level < depth;
  /** Returns the index after the division at `index`, or the slide. */
  const endOf = (index: number) => {
    const slide = source[index];
    if (slide === undefined || !isDivision(slide)) {
      return index + 1;
    }
    const level = slide.level ?? 0;
    const end = source.findIndex(
      (other, otherIndex) =>
        otherIndex > index && other.level !== undefined && other.level <= level,
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
      const draft = include(target, original, id ?? target.id);
      copyRange(draft, target.attributes);
      if (target.recap !== undefined) {
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
      draft.includeGroup = group;
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
    shift = parentLevel + 1 - (target.level ?? 1);
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
  // The top level of the deck is nested in the division of the directive.
  shift = parentLevel;
  return includeRange(start, end);

  /**
   * Includes the slides from `start` to `end`, keeping their structure,
   * ranges, recaps, and `spare` attributes.
   */
  function includeRange(start: number, end: number): SlideDraft[] {
    const range = source.slice(start, end);
    // The included slides that recaps of slides outside the range recap.
    const recapped = new Map<SlideDraft, string | undefined>();
    const drafts: SlideDraft[] = [];
    for (const [offset, slide] of range.entries()) {
      const index = start + offset;
      if (slide.noSlide === true) {
        const draft = createSlide('content', slide.id, undefined);
        draft.noSlide = true;
        draft.headingText = slide.headingText;
        draft.tocTitle = slide.tocTitle;
        draft.level = shiftLevel(slide.level);
        draft.spareAttribute = slide.spareAttribute;
        draft.place = place;
        drafts.push(draft);
        continue;
      }
      const original =
        slide.recap === undefined ? slide : findOriginal(source, slide);
      // Recaps refer to the included slide by its id.
      const recapTarget =
        original === undefined || original === slide
          ? undefined
          : range.includes(original)
            ? original.id
            : recapped.get(original);
      let draft: SlideDraft;
      if (original === undefined) {
        file.message(
          `Can't find the slide that \`${slide.id ?? 'a recap'}\` in \`${specifier}\` recaps`,
          { place },
        );
        continue;
      } else if (original === slide) {
        draft = include(slide, slide, slide.id);
        draft.level = shiftLevel(slide.level);
        draft.tocTitle = slide.tocTitle;
        copyRange(draft, slide.attributes);
      } else if (recapTarget !== undefined) {
        // Recaps the included slide.
        draft = createSlide('content', slide.id, undefined);
        draft.recap = recapTarget;
        draft.tocTitle = slide.tocTitle;
        draft.place = place;
        copyRange(draft, slide.attributes);
      } else {
        // The first recap of a slide outside the range shows the slide, and
        // so do recaps of slides without ids, which can't be referred to.
        draft = include(slide, original, slide.id);
        draft.tocTitle = slide.tocTitle;
        copyRange(draft, slide.attributes);
        setRecapStart(draft, source, index, original);
        recapped.set(original, slide.id);
      }
      draft.spareAttribute = slide.spareAttribute;
      drafts.push(draft);
    }
    for (const draft of drafts) {
      draft.includeGroup = group;
    }
    return drafts;
  }
}
