import { readFileSync } from 'node:fs';

import GithubSlugger from 'github-slugger';
import type { Nodes, Root, RootContent } from 'mdast';
import type { LeafDirective } from 'mdast-util-directive';
import type { PluggableList } from 'unified';
import type { Node } from 'unist';
import type { VFile } from 'vfile';

import { hasDirective } from '../directives/directives.ts';
import { rewriteHeadingAttributes } from '../directives/remarkHeadingAttributes.ts';
import { getDeckFrontmatter, parseDeck } from './frontmatter.ts';
import {
  expandSelfIncludes,
  includeSlides,
  readStructure,
  type IncludeContext,
} from './includes.ts';
import { buildSlides, finishSlides, type SlideDraft } from './slideDrafts.ts';
import { getDeckLang } from './uiLocales.ts';

/** Replaces the text from `start` to `end` of a source with `text`. */
interface Edit {
  start: number;
  end: number;
  text: string;
}

/** The source of a deck, and the edits that turn it into Markdown. */
interface MarkdownSource {
  source: string;
  /** The deck as parsed by `parseDeck`. */
  tree: Root;
  /** Returns where `node` is in `source`, if it's known. */
  range: (node: Node) => { start: number; end: number } | undefined;
  edits: Edit[];
}

/**
 * Maps offsets in `rewritten`, as `rewriteHeadingAttributes` rewrites
 * `source`, to offsets in `source`. The rewriting only inserts the names of
 * directives before `{`, which they don't contain, so the characters that
 * differ are the inserted ones.
 */
function offsetMap(
  source: string,
  rewritten: string,
): (offset: number) => number {
  const offsets = new Int32Array(rewritten.length + 1);
  let original = 0;
  for (let offset = 0; offset < rewritten.length; offset += 1) {
    offsets[offset] = original;
    if (rewritten[offset] === source[original]) {
      original += 1;
    }
  }
  offsets[rewritten.length] = original;
  return (offset) => offsets[offset] ?? source.length;
}

/**
 * Whether `node` is a comment: an MDX expression with nothing but comments,
 * e.g., `{/* note *\/}`, or an HTML comment.
 */
function isComment(node: Nodes): boolean {
  if (node.type === 'mdxFlowExpression' || node.type === 'mdxTextExpression') {
    return node.data?.estree?.body.length === 0;
  }
  return node.type === 'html' && /^<!--[^]*-->$/.test(node.value.trim());
}

function collectComments(node: Nodes, comments: Nodes[]) {
  if (isComment(node)) {
    comments.push(node);
  } else if ('children' in node) {
    for (const child of node.children) {
      collectComments(child, comments);
    }
  }
}

const BLANK_LINE = /^[ \t]*(?:\n|$)/;

/**
 * Removes the comment from `start` to `end` of `source`: its lines, if it's on
 * lines of its own, without leaving two blank lines, or else the comment with
 * a space before it, if it's between words.
 */
function removeComment(source: string, start: number, end: number): Edit {
  const lineStart = source.lastIndexOf('\n', start - 1) + 1;
  const newline = source.indexOf('\n', end);
  const lineEnd = newline < 0 ? source.length : newline + 1;
  if (
    source.slice(lineStart, start).trim() !== '' ||
    source.slice(end, lineEnd).trim() !== ''
  ) {
    const spaced =
      source[start - 1] === ' ' && /^(?:[ \n]|$)/.test(source.slice(end));
    return { start: spaced ? start - 1 : start, end, text: '' };
  }
  const afterBlank =
    lineStart === 0 || /(?:^|\n)[ \t]*\n$/.test(source.slice(0, lineStart));
  const blank = BLANK_LINE.exec(source.slice(lineEnd));
  return {
    start: lineStart,
    end: afterBlank && blank !== null ? lineEnd + blank[0].length : lineEnd,
    text: '',
  };
}

/** Parses `source` of the deck at `deckPath`, and removes its comments. */
function readMarkdownSource(
  source: string,
  deckPath: string,
  syntaxPlugins: PluggableList,
): MarkdownSource & { file: VFile } {
  const { tree, file } = parseDeck(source, deckPath, syntaxPlugins);
  // Positions refer to the rewritten source, see `remarkHeadingAttributes`.
  const offset = offsetMap(source, rewriteHeadingAttributes(source));
  const range = (node: Node) => {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    return start === undefined || end === undefined
      ? undefined
      : { start: offset(start), end: offset(end) };
  };
  const comments: Nodes[] = [];
  collectComments(tree, comments);
  const edits = comments.flatMap((comment) => {
    const place = range(comment);
    return place === undefined
      ? []
      : [removeComment(source, place.start, place.end)];
  });
  return { source, tree, range, edits, file };
}

/**
 * Returns the text of `markdown` from `start` to `end` with its edits that
 * start there applied.
 */
function editedText(
  { source, edits }: MarkdownSource,
  start: number,
  end: number,
): string {
  let text = '';
  let position = start;
  for (const edit of [...edits].sort((a, b) => a.start - b.start)) {
    if (edit.start < position || edit.start >= end) {
      continue;
    }
    text += source.slice(position, edit.start) + edit.text;
    position = Math.min(edit.end, end);
  }
  return text + source.slice(position, end);
}

/** A deck that slides are included from, with its exported slides. */
interface IncludedDeck {
  markdown: MarkdownSource;
  /** The slides by the index of their exports. */
  slides: SlideDraft[];
}

const ATX_HEADING = /^ {0,3}(#{1,6})(?=[ \t]|$)/;

/** Whether the top-level `node` of a deck of `depth` starts a slide. */
function startsSlide(node: RootContent, depth: number): boolean {
  return (
    (node.type === 'heading' &&
      (node.depth <= depth || hasDirective(node.children, 'slide'))) ||
    node.type === 'thematicBreak' ||
    (node.type === 'leafDirective' &&
      ['slide', 'recap', 'include'].includes(node.name))
  );
}

/**
 * Returns the source of a deck as Markdown that reads as plain text, e.g., for
 * AI tools that read the page of the deck: without its MDX and HTML comments,
 * and with the sources of the slides that it includes from other decks with
 * `::include`, instead of the directives. The headings of included content
 * slides are at the level of content slides of the deck, and included recaps
 * and divisions without slides are `::recap` directives and headings with
 * `noslide`. Includes of slides of the deck itself are kept as they are, and
 * so are includes that fail.
 */
export function deckMarkdown(
  source: string,
  deckPath: string,
  syntaxPlugins: PluggableList = [],
): string {
  const markdown = readMarkdownSource(source, deckPath, syntaxPlugins);
  const { tree, file } = markdown;
  const frontmatter = getDeckFrontmatter(tree, file);
  const depth = frontmatter['depth'] as number;
  // Before building the slides, which takes the `:slide` directives out of
  // the headings.
  const breakAfter = new Set(
    tree.children.flatMap((node, index) => {
      const next = tree.children
        .slice(index + 1)
        .find((other) => other.type !== 'mdxjsEsm' && !isComment(other));
      return node.type === 'leafDirective' &&
        node.name === 'include' &&
        next !== undefined &&
        !startsSlide(next, depth)
        ? [node]
        : [];
    }),
  );
  const context: IncludeContext = {
    file,
    depth,
    lang: getDeckLang(frontmatter, file),
    esm: [],
    imports: { count: 0 },
    stack: [],
    shown: new Map(),
    syntaxPlugins,
  };
  const includes = new Map<LeafDirective, SlideDraft[]>();
  const slugger = new GithubSlugger();
  const slides = buildSlides(tree.children, {
    file,
    depth,
    slugger,
    esm: [],
    onInclude: (directive) => {
      const included = includeSlides(directive, context);
      includes.set(directive, included);
      return included;
    },
  });
  expandSelfIncludes(slides, file, depth);
  // Gives the slides that included recaps recap their ids.
  finishSlides(slides, slugger);

  const decks = new Map<string, IncludedDeck>();
  const readDeck = (includedPath: string): IncludedDeck => {
    let deck = decks.get(includedPath);
    if (deck === undefined) {
      const structure = readStructure(includedPath, context);
      deck = {
        markdown: readMarkdownSource(
          readFileSync(includedPath, 'utf8'),
          includedPath,
          syntaxPlugins,
        ),
        slides: [...structure.exports.keys()],
      };
      decks.set(includedPath, deck);
    }
    return deck;
  };
  /** Returns the source of the slide that `draft` includes. */
  const slideSource = (draft: SlideDraft): string | undefined => {
    const hash = draft.origin?.lastIndexOf('#') ?? -1;
    if (draft.origin === undefined || hash < 0) {
      return undefined;
    }
    const deck = readDeck(draft.origin.slice(0, hash));
    const slide = deck.slides[Number(draft.origin.slice(hash + 1))];
    if (slide === undefined) {
      return undefined;
    }
    const { tree: includedTree, range } = deck.markdown;
    // Copies of slides start at the `::include` that copies them.
    const start =
      slide.place === undefined
        ? undefined
        : includedTree.children.find(
            (node) =>
              node.position?.start.offset === slide.place?.start.offset &&
              (node.type === 'heading' ||
                (node.type === 'leafDirective' && node.name === 'slide')),
          );
    const ranges = [start, ...slide.children].flatMap((node) => {
      const place = node === undefined ? undefined : range(node);
      return place === undefined ? [] : [place];
    });
    const first = ranges[0];
    const last = ranges.at(-1);
    if (first === undefined || last === undefined) {
      return undefined;
    }
    let text = editedText(deck.markdown, first.start, last.end).trimEnd();
    const level = draft.division === true ? draft.level : depth;
    if (start?.type === 'heading' && level !== undefined && level > 0) {
      text = text.replace(ATX_HEADING, (heading, hashes: string) =>
        heading.replace(hashes, '#'.repeat(level)),
      );
    }
    const heading = ATX_HEADING.exec(text)?.[1];
    return /^::slide(?![\w-])/.test(text) ||
      (heading !== undefined && heading.length <= depth)
      ? text
      : `---\n\n${text}`;
  };
  const includedSource = (draft: SlideDraft): string | undefined => {
    if (draft.recapTarget !== undefined) {
      return draft.recap === undefined ? undefined : `::recap[#${draft.recap}]`;
    }
    if (draft.noSlide === true) {
      return draft.level === undefined || draft.headingText === undefined
        ? undefined
        : `${'#'.repeat(draft.level)} ${draft.headingText} {noslide}`;
    }
    return slideSource(draft);
  };

  for (const [directive, included] of includes) {
    const place = markdown.range(directive);
    if (
      place === undefined ||
      included.some(({ selfInclude }) => selfInclude !== undefined)
    ) {
      continue;
    }
    const parts = included.flatMap((draft) => {
      const text = includedSource(draft);
      return text === undefined ? [] : [text];
    });
    if (parts.length === 0) {
      continue;
    }
    // Content after the included slides is a slide of its own.
    if (breakAfter.has(directive)) {
      parts.push('---');
    }
    markdown.edits.push({ ...place, text: parts.join('\n\n') });
  }
  return editedText(markdown, 0, source.length);
}
