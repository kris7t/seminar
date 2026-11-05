import type { ElementContent } from 'hast';
import type { Position } from 'unist';
import type { VFile } from 'vfile';

import type { Attributes } from '../directives/directives.ts';
import type { LoadedSeminarConfigEntry } from './remarkSeminarConfig.ts';

/** A named export of a module. */
export interface ModuleExport {
  source: string;
  exportName: string;
}

/**
 * What a Seminar config registers for the code blocks of a language, see
 * `CodeBlockConfig` of `@seminar/core`.
 */
export interface CodeBlockRegistration {
  /** The {@link CodeBlockHandlerFactory} that compiling decks imports. */
  handler: ModuleExport;
  /** The component that decks import to render the code blocks. */
  component: ModuleExport;
  /**
   * The exported type of the attributes after the language, for editors to
   * check them. Defaults to the props of `component`, other than `lang`,
   * `code`, `meta`, and `children`.
   */
  attributes?: ModuleExport | undefined;
}

/** Registrations of code blocks by their languages, or `*` for the rest. */
export type CodeBlockRegistrations = Record<string, CodeBlockRegistration>;

/** A code block of a deck, as a {@link CodeBlockHandler} gets it. */
export interface CodeBlock {
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
   * The attributes after the language, e.g., `#fib step`, which compiling
   * the deck passes to the component as the props of a step.
   */
  attributes: Attributes;
  /** Where the block is in the deck. */
  place: Position | undefined;
}

/** What a {@link CodeBlockHandler} renders a code block with. */
export interface CodeBlockResult {
  /** Props of the component, which have to be JSON. */
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
 * Renders a code block with the component of its registration, or returns
 * `undefined` to leave it to the registration of `*`, and then to the plain
 * `CodeBlock` of `@seminar/core`.
 */
export type CodeBlockHandler = (
  block: CodeBlock,
) => Promise<CodeBlockResult | undefined> | CodeBlockResult | undefined;

/**
 * Creates the {@link CodeBlockHandler} for the code blocks of a deck, once
 * for each deck, e.g., to read options of the deck. Registered in the
 * `codeBlocks` of a Seminar config.
 */
export type CodeBlockHandlerFactory = (deck: {
  file: VFile;
}) => CodeBlockHandler;

/** A registration of code blocks with its imported handler. */
export interface LoadedCodeBlock {
  handler: CodeBlockHandlerFactory;
  component: ModuleExport;
}

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
  for (const [lang, descriptor] of Object.entries(value)) {
    const handler = isRecord(descriptor) ? descriptor['handler'] : undefined;
    const component = isRecord(descriptor)
      ? descriptor['component']
      : undefined;
    const attributes = isRecord(descriptor)
      ? descriptor['attributes']
      : undefined;
    if (!isModuleExport(handler) || !isModuleExport(component)) {
      file.message(
        `Expected the code blocks of \`${lang}\` in ${source} to have a \`handler\` and a \`component\` with nonempty \`source\` and \`exportName\` strings`,
      );
      continue;
    }
    if (attributes !== undefined && !isModuleExport(attributes)) {
      file.message(
        `Expected \`attributes\` of the code blocks of \`${lang}\` in ${source} to have nonempty \`source\` and \`exportName\` strings`,
      );
    }
    result[lang] = {
      handler: { source: handler.source, exportName: handler.exportName },
      component: { source: component.source, exportName: component.exportName },
      ...(isModuleExport(attributes)
        ? {
            attributes: {
              source: attributes.source,
              exportName: attributes.exportName,
            },
          }
        : {}),
    };
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
