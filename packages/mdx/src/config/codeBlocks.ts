import type { LoadedSeminarConfigEntry } from './remarkSeminarConfig.ts';

/**
 * What a Seminar config tells about the code blocks of a language, for
 * editors (see `CodeBlockConfig` of `@seminar/core`).
 */
export interface CodeBlockRegistration {
  /** Module that exports the type of the attributes. */
  source: string;
  /** Name of the exported type of the attributes after the language. */
  attributes: string;
}

/** Registrations of code blocks by their languages, or `*` for the rest. */
export type CodeBlockRegistrations = Record<string, CodeBlockRegistration>;

/** Reports problems with registrations, like a `VFile`. */
export interface CodeBlockReporter {
  message: (reason: string) => unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
    if (
      !isRecord(descriptor) ||
      typeof descriptor['source'] !== 'string' ||
      descriptor['source'] === '' ||
      typeof descriptor['attributes'] !== 'string' ||
      descriptor['attributes'] === ''
    ) {
      file.message(
        `Expected the code blocks of \`${lang}\` in ${source} to have nonempty \`source\` and \`attributes\` strings`,
      );
      continue;
    }
    result[lang] = {
      source: descriptor['source'],
      attributes: descriptor['attributes'],
    };
  }
  return result;
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
    Object.assign(
      registrations,
      parseCodeBlocks(
        isRecord(entry.config) ? entry.config['codeBlocks'] : undefined,
        `the config of ${entry.source}`,
        file,
      ),
    );
  }
  return registrations;
}
