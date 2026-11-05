import type { ElementContent } from 'hast';
import type { Position } from 'unist';
import type { VFile } from 'vfile';

import type { LoadedSeminarConfigEntry } from './remarkSeminarConfig.ts';

/** A named export of a module. */
export interface ModuleExport {
  source: string;
  exportName: string;
}

/**
 * The handlers of code blocks that a Seminar config registers, by their
 * languages, or `*` for the rest, see `CodeBlockConfig` of `@seminar/core`.
 * Each is a {@link CodeBlockHandlerFactory} that compiling decks imports.
 */
export type CodeBlockRegistrations = Record<string, ModuleExport>;

/** A code block of a deck, as a {@link CodeBlockHandler} gets it. */
export interface CodeBlock<Props = Record<string, unknown>> {
  /** The language of the block, e.g., `ts`, if it has one. */
  lang: string | undefined;
  /** The text of the block. */
  code: string;
  /**
   * The words after the language that aren't attributes, e.g., `{1-3}`,
   * joined with spaces, if there are any.
   */
  meta: string | undefined;
  /**
   * The attributes after the language, parsed like those of `:step`, e.g.,
   * `{ id: 'fib', step: true, className: 'wide' }` for `#fib step .wide`.
   * Editors check them against `Props`, but they're whatever the deck says.
   */
  props: Props;
  /** Where the block is in the deck. */
  place: Position | undefined;
}

/** What a {@link CodeBlockHandler} renders a code block with. */
export interface CodeBlockResult {
  /** The component that renders the block, which decks import. */
  component: ModuleExport;
  /**
   * Props of the component, which have to be JSON, e.g., the `props` of the
   * {@link CodeBlock}, so that it can be a step.
   */
  props?: Record<string, unknown> | undefined;
  /**
   * Props of the component whose values are imported, e.g., by the deck,
   * `{ diagram: { source: 'pele/diagrams/flowchart', exportName: 'default' } }`.
   */
  imports?: Record<string, ModuleExport> | undefined;
  /** Children of the component, e.g., the highlighted code. */
  children?: ElementContent[] | undefined;
}

/**
 * Renders a code block, or returns `undefined` to leave it to the handler of
 * `*`, and then to the plain `CodeBlock` of `@seminar/core`.
 */
export type CodeBlockHandler<Props = Record<string, unknown>> = (
  block: CodeBlock<Props>,
) => Promise<CodeBlockResult | undefined> | CodeBlockResult | undefined;

/**
 * Creates the {@link CodeBlockHandler} for the code blocks of a deck, once
 * for each deck, e.g., to read options of the deck. Registered in the
 * `codeBlocks` of a Seminar config. Editors check the attributes of code
 * blocks against `Props`.
 */
export type CodeBlockHandlerFactory<Props = Record<string, unknown>> = (deck: {
  file: VFile;
}) => CodeBlockHandler<Props>;

/** Reports problems with registrations, like a `VFile`. */
export interface CodeBlockReporter {
  message: (reason: string) => unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isModuleExport(value: unknown): value is ModuleExport {
  return (
    isRecord(value) &&
    typeof value['source'] === 'string' &&
    value['source'] !== '' &&
    typeof value['exportName'] === 'string' &&
    value['exportName'] !== ''
  );
}

/** Reads the code block registrations from an untrusted Seminar config. */
export function parseCodeBlocks(
  value: unknown,
  source: string,
  file: CodeBlockReporter,
): CodeBlockRegistrations {
  if (value === undefined) {
    return {};
  }
  if (!isRecord(value)) {
    file.message(`Expected \`codeBlocks\` in ${source} to be an object`);
    return {};
  }
  const result: CodeBlockRegistrations = {};
  for (const [lang, handler] of Object.entries(value)) {
    if (!isModuleExport(handler)) {
      file.message(
        `Expected the handler of the code blocks of \`${lang}\` in ${source} to have nonempty \`source\` and \`exportName\` strings`,
      );
      continue;
    }
    result[lang] = { source: handler.source, exportName: handler.exportName };
  }
  return result;
}

/** Returns the code block registrations of the config of `entry`. */
export function codeBlocksOf(
  entry: LoadedSeminarConfigEntry,
  file: CodeBlockReporter,
): CodeBlockRegistrations {
  return parseCodeBlocks(
    isRecord(entry.config) ? entry.config['codeBlocks'] : undefined,
    `the config of ${entry.source}`,
    file,
  );
}

/**
 * Collects the code block registrations of the loaded Seminar configs, where
 * later configs, like the theme, replace the registrations of earlier ones.
 */
export function collectCodeBlocks(
  entries: readonly LoadedSeminarConfigEntry[],
  file: CodeBlockReporter,
): CodeBlockRegistrations {
  const registrations: CodeBlockRegistrations = {};
  for (const entry of entries) {
    Object.assign(registrations, codeBlocksOf(entry, file));
  }
  return registrations;
}
