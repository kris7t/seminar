import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

import { getSliderOptionLayers } from '@slider/mdx';
import type { LanguageRegistration, ThemeRegistration } from 'shiki';
import type { VFile } from 'vfile';

import type { HighlightOptions } from './highlight.ts';

/** Name of the options of `@slider/plugin-shiki`, and of their key in the frontmatter. */
export const OPTIONS_NAME = 'code';

/**
 * A file to load a grammar or a theme from, either its path, or its path
 * with a `name` to use instead of the one in the file, and for grammars,
 * `aliases` of the language.
 */
type FileEntry =
  string | { path: string; name?: string; aliases?: readonly string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStrings(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === 'string')
  );
}

function parseEntry(value: unknown): FileEntry | undefined {
  if (typeof value === 'string' && value !== '') {
    return value;
  }
  if (
    !isRecord(value) ||
    typeof value['path'] !== 'string' ||
    value['path'] === '' ||
    (value['name'] !== undefined && typeof value['name'] !== 'string') ||
    (value['aliases'] !== undefined && !isStrings(value['aliases']))
  ) {
    return undefined;
  }
  return {
    path: value['path'],
    ...(value['name'] === undefined ? {} : { name: value['name'] }),
    ...(value['aliases'] === undefined ? {} : { aliases: value['aliases'] }),
  };
}

/**
 * Resolves `file` from `base`: relative paths from its directory, and
 * others, e.g., `some-package/grammar.json`, as packages.
 */
function resolveFile(file: string, base: string): string {
  if (file.startsWith('.') || path.isAbsolute(file)) {
    return path.resolve(path.dirname(base), file);
  }
  return createRequire(base).resolve(file);
}

/**
 * Reads the JSON files listed in `key` of the `code` options, from every
 * config and the frontmatter, since grammars and themes add up.
 */
async function readFiles(
  file: VFile,
  key: 'languages' | 'themes',
): Promise<{ entry: FileEntry; json: Record<string, unknown> }[]> {
  const files: { entry: FileEntry; json: Record<string, unknown> }[] = [];
  for (const { options, base, source } of getSliderOptionLayers(
    file,
    OPTIONS_NAME,
  )) {
    const value = options[key];
    if (value === undefined) {
      continue;
    }
    if (!Array.isArray(value)) {
      file.message(`Expected \`${key}\` of ${source} to be an array`);
      continue;
    }
    for (const item of value as unknown[]) {
      const entry = parseEntry(item);
      if (entry === undefined) {
        file.message(
          `Expected the \`${key}\` of ${source} to be paths, or objects with a \`path\`, and an optional \`name\` and \`aliases\``,
        );
        continue;
      }
      const filePath = typeof entry === 'string' ? entry : entry.path;
      try {
        const json: unknown = JSON.parse(
          await readFile(resolveFile(filePath, base), 'utf8'),
        );
        if (!isRecord(json)) {
          throw new Error('expected an object');
        }
        files.push({ entry, json });
      } catch (error) {
        file.message(
          `Cannot read ${filePath} in the \`${key}\` of ${source}: ${String(error)}`,
        );
      }
    }
  }
  return files;
}

/**
 * Reads the `code` options of the deck that `file` compiles: the `theme`,
 * and the grammars and themes to load from the files listed in `languages`
 * and `themes`.
 */
export async function readCodeOptions(file: VFile): Promise<HighlightOptions> {
  let theme: string | undefined;
  for (const { options, source } of getSliderOptionLayers(file, OPTIONS_NAME)) {
    const value = options['theme'];
    if (value === undefined) {
      continue;
    }
    if (typeof value === 'string' && value !== '') {
      theme = value;
    } else {
      file.message(`Expected \`theme\` of ${source} to be a name`);
    }
  }
  const languages = (await readFiles(file, 'languages')).flatMap(
    ({ entry, json }): LanguageRegistration[] => {
      const name =
        typeof entry === 'string' ? json['name'] : (entry.name ?? json['name']);
      if (typeof name !== 'string' || typeof json['scopeName'] !== 'string') {
        file.message(
          `Expected the grammar ${typeof entry === 'string' ? entry : entry.path} to have a \`scopeName\`, and a \`name\`, or a \`name\` given with it`,
        );
        return [];
      }
      const aliases = typeof entry === 'string' ? undefined : entry.aliases;
      return [
        {
          ...(json as unknown as LanguageRegistration),
          name,
          ...(aliases === undefined ? {} : { aliases: [...aliases] }),
        },
      ];
    },
  );
  const themes = (await readFiles(file, 'themes')).flatMap(
    ({ entry, json }): ThemeRegistration[] => {
      const name =
        typeof entry === 'string' ? json['name'] : (entry.name ?? json['name']);
      if (typeof name !== 'string') {
        file.message(
          `Expected the theme ${typeof entry === 'string' ? entry : entry.path} to have a \`name\`, or a \`name\` given with it`,
        );
        return [];
      }
      return [{ ...(json as unknown as ThemeRegistration), name }];
    },
  );
  return { theme, languages, themes };
}
