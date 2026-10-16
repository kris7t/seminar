import type GithubSlugger from 'github-slugger';
import type { PhrasingContent, RootContent } from 'mdast';
import type { LeafDirective } from 'mdast-util-directive';
import { toString } from 'mdast-util-to-string';
import type { Position } from 'unist';
import type { VFile } from 'vfile';

import {
  getAttributes,
  hasDirective,
  takeDirective,
  type Attributes,
} from '../directives/directives.ts';

/**
 * The master of a slide: the name of a master in the theme, or of a component
 * imported (or declared) in the document.
 */
export interface MasterReference {
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

export interface SlideDraft {
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
  headingText?: string | undefined;
  /** Id of the slide that this slide recaps, if it's a recap. */
  recap?: string;
  /**
   * The name of the imported component of a slide included from another
   * deck (see `::include`), which renders the slide instead of `children`.
   */
  include?: string;
  /**
   * Identifies the slide that an included slide shows by the deck that
   * defines it and its index there, so that the slide is only included once.
   */
  origin?: string | undefined;
  /**
   * An `::include` of slides of this deck, which is replaced by the included
   * slides once all slides are built, see `expandSelfIncludes`.
   */
  selfInclude?: LeafDirective;
  /**
   * The slide that this slide recaps, for recaps created by `::include`,
   * whose `recap` is set to its id by {@link finishSlides}.
   */
  recapTarget?: SlideDraft;
  /** Whether to only show the last step, e.g., for included recaps. */
  fromLast?: boolean;
  /** The title of an included slide as text, e.g., to derive an id from. */
  tocText?: string | undefined;
  /**
   * Ids of divisions without slides that refer to this slide, set by
   * {@link resolveDivisionIds}.
   */
  aliases?: string[];
  /** Title of the slide in the table of contents, if set explicitly. */
  tocTitle?: string | undefined;
  /**
   * Whether the slide starts a division, like a section, i.e., its heading is
   * above the depth of its deck, which may be another deck for included
   * slides.
   */
  division?: boolean;
  /** Level of the heading of the slide, if any. */
  level: number | undefined;
}

/** An entry of the table of contents, as in `@slider/core`. */
export interface TocEntry {
  slide?: number;
  title?: string;
  children?: TocEntry[];
}

/**
 * Returns the level of each slide in the structure of the deck: the level of
 * the heading of divisions, and a level below the deepest division for other
 * slides, i.e., the level of the content slides of the deck, or deeper for
 * divisions included from decks with a greater depth.
 */
export function structureLevels(
  slides: readonly SlideDraft[],
  depth: number,
): number[] {
  const contentLevel = Math.max(
    depth,
    1,
    ...slides.map(({ division, level }) =>
      division === true && level !== undefined ? level + 1 : 0,
    ),
  );
  return slides.map(({ division, level }) =>
    division === true && level !== undefined ? level : contentLevel,
  );
}

/**
 * Creates the table of contents of the deck, where the slides are nested by
 * the levels of their headings, e.g., the content slides of a section in its
 * section slide. Slides without headings, and those with headings deeper than
 * the depth, are at the level of content slides.
 * The titles are taken from the slides by the `Deck`, which also names slides
 * without titles. Headings with `noslide` get entries without slides.
 */
export function createToc(
  slides: readonly SlideDraft[],
  depth: number,
): TocEntry[] {
  const levels = structureLevels(slides, depth);
  const toc: TocEntry[] = [];
  const stack: { level: number; entry: TocEntry }[] = [];
  let index = 0;
  for (const [position, slide] of slides.entries()) {
    const title = slide.tocTitle;
    // Headings deeper than the depth, e.g., with `:slide`, start content
    // slides, too.
    const level = levels[position] ?? 0;
    let entry: TocEntry;
    if (slide.noSlide === true) {
      // Titled by the heading, since there is no slide to take it from.
      entry = { title: slide.tocTitle ?? slide.headingText ?? '' };
    } else {
      entry = title === undefined ? { slide: index } : { slide: index, title };
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
export function getMaster(level: number, depth: number): string {
  return level === depth
    ? 'content'
    : (HEADING_MASTERS[level - 1] ?? 'content');
}

export function createSlide(
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

/** Attributes that recaps take, while the rest come from the recapped slide. */
const RECAP_ATTRIBUTES: ReadonlySet<string> = new Set([
  'title',
  'spare',
  'from',
  'after',
  'to',
  'before',
]);

/**
 * Creates a recap of a slide from a `::recap[#id]{…}` directive, or reports
 * the directive if it doesn't refer to a slide by id.
 *
 * Recaps take their id, title in the table of contents, range of steps, and
 * `spare`, but other attributes, like the master and classes, come from the
 * recapped slide, and are reported. The `Deck` resolves the recapped slide.
 */
export function createRecap(
  node: LeafDirective,
  file: VFile,
): SlideDraft | undefined {
  const label = toString(node).trim();
  if (!label.startsWith('#') || label.length === 1) {
    file.message(
      'Expected `::recap` to refer to a slide by its id, e.g., `::recap[#intro]`',
      { place: node.position },
    );
    return undefined;
  }
  const { id, classes, attributes } = getAttributes(node);
  const ignored = [
    ...classes.map((name) => `.${name}`),
    ...[...attributes.keys()].filter((key) => !RECAP_ATTRIBUTES.has(key)),
  ];
  for (const attribute of ignored) {
    file.message(
      `Ignoring \`${attribute}\` on a recap, which takes it from the recapped slide`,
      { place: node.position },
    );
  }
  const slide = createSlide('content', id, undefined);
  slide.recap = label.slice(1);
  slide.place = node.position;
  slide.tocTitle = attributes.get('title');
  slide.spareAttribute = attributes.get('spare');
  for (const bound of STEP_BOUNDS) {
    const value = attributes.get(bound);
    if (value !== undefined) {
      slide.attributes.set(bound, value);
    }
  }
  return slide;
}

/** Attributes of slides that restrict their steps, see `StepRange`. */
export const STEP_BOUNDS: readonly ['from', 'after', 'to', 'before'] = [
  'from',
  'after',
  'to',
  'before',
] as const;

/** A step path, which may start with the name of a group. */
const STEP_BOUND_PATTERN = /^(?:\d+|[A-Za-z_][\w-]*)(?:\.\d+)*$/;

/** Whether `value` is a step path, which may start with the name of a group. */
export function isStepBound(value: string): boolean {
  return STEP_BOUND_PATTERN.test(value);
}

/** Attributes that are flags of slides, which aren't passed as props. */
export const FLAGS: ReadonlySet<string> = new Set(['spare', 'noslide']);

/**
 * Applies the attributes of a `:slide` directive to a slide.
 *
 * A bare word, like `section`, sets the master to a master of the theme, like
 * the shorthands of step behaviors. `master=Name` sets the master to a
 * component imported or declared in the document if there is one, and to a
 * master of the theme otherwise. `master=` takes precedence over bare words,
 * and of several bare words, the last one is used. Classes are passed to the
 * master as its `className`.
 */
export function applyAttributes(
  slide: SlideDraft,
  { id, classes, attributes }: Attributes,
): void {
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
export function resolveSpares(
  slides: SlideDraft[],
  depth: number,
  file: VFile,
): void {
  const levels = structureLevels(slides, depth);
  // The enclosing divisions of the current slide, outermost first.
  const divisions: { level: number; spare: boolean }[] = [];
  for (const [index, slide] of slides.entries()) {
    const { spareAttribute, place } = slide;
    const level = levels[index] ?? 0;
    while ((divisions.at(-1)?.level ?? 0) >= level) {
      divisions.pop();
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
    if (slide.division === true) {
      divisions.push({ level, spare });
    }
  }
}

/**
 * Lets the ids of divisions without slides refer to the first slide of the
 * division that isn't spare, or to its first slide if all of them are, by
 * making them aliases of that slide. Must run after {@link resolveSpares}.
 */
export function resolveDivisionIds(
  slides: readonly SlideDraft[],
  depth: number,
): void {
  const levels = structureLevels(slides, depth);
  for (const [index, division] of slides.entries()) {
    const { noSlide, id } = division;
    const level = levels[index] ?? 0;
    if (noSlide !== true || id === undefined) {
      continue;
    }
    const members: SlideDraft[] = [];
    for (const [offset, slide] of slides.slice(index + 1).entries()) {
      if ((levels[index + 1 + offset] ?? 0) <= level) {
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

/** What {@link buildSlides} needs to know about the document. */
export interface BuildContext {
  file: VFile;
  /** The depth of the deck, see `getDeckFrontmatter`. */
  depth: number;
  /** Creates the ids of slides from their titles. */
  slugger: GithubSlugger;
  /** Collects the ESM of the document, which isn't part of any slide. */
  esm: RootContent[];
  /**
   * Returns the slides included by an `::include` directive, see
   * `includeSlides`. Without it, the directive is reported and ignored.
   */
  onInclude?: ((directive: LeafDirective) => SlideDraft[]) | undefined;
}

/**
 * Splits the top-level nodes of a deck into slides (see `remarkSlides`), and
 * collects its ESM.
 */
export function buildSlides(
  nodes: readonly RootContent[],
  { file, depth, slugger, esm, onInclude }: BuildContext,
): SlideDraft[] {
  const slides: SlideDraft[] = [];
  let current: SlideDraft | undefined;

  for (const node of nodes) {
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
      current.division = node.depth < depth;
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
    } else if (node.type === 'leafDirective' && node.name === 'include') {
      if (onInclude === undefined) {
        file.message("Ignoring `::include`, which isn't supported here", {
          place: node.position,
        });
      } else {
        slides.push(...onInclude(node));
      }
      // Content after the included slides gets a slide of its own.
      current = undefined;
    } else if (node.type === 'leafDirective' && node.name === 'recap') {
      const recap = createRecap(node, file);
      if (recap !== undefined) {
        current = recap;
        slides.push(current);
      }
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

  return slides;
}

/** Follows the `recapTarget` of `slide` to the slide it recaps, if any. */
function findRecapTarget(slide: SlideDraft): SlideDraft | undefined {
  const visited = new Set<SlideDraft>();
  let target = slide.recapTarget;
  while (target?.recapTarget !== undefined && !visited.has(target)) {
    visited.add(target);
    target = target.recapTarget;
  }
  return target;
}

/**
 * Makes the ids of the slides unique, e.g., if slides included from another
 * deck have the ids of slides of this deck, by adding numbers to the ids of
 * later slides.
 */
function dedupeIds(slides: readonly SlideDraft[]) {
  const used = new Set<string>();
  for (const slide of slides) {
    const { id } = slide;
    if (id === undefined) {
      continue;
    }
    let unique = id;
    for (let n = 1; used.has(unique); n += 1) {
      unique = `${id}-${String(n)}`;
    }
    used.add(unique);
    slide.id = unique;
  }
}

/**
 * Finishes the slides after {@link buildSlides}: gives the slides that recaps
 * created by `::include` recap an id if they have none, makes the ids unique,
 * and refers to the slides by their ids in the recaps.
 */
export function finishSlides(
  slides: readonly SlideDraft[],
  slugger: GithubSlugger,
): void {
  for (const slide of slides) {
    const target = findRecapTarget(slide);
    if (target !== undefined && target.id === undefined) {
      target.id = slugger.slug(target.tocText ?? 'slide');
    }
  }
  dedupeIds(slides);
  for (const slide of slides) {
    const target = findRecapTarget(slide);
    if (target?.id !== undefined) {
      slide.recap = target.id;
    }
  }
}
