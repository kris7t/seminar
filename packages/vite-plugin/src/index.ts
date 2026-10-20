import rollupSeminar, {
  type SeminarPlugin as RollupSeminarPlugin,
  type SeminarPluginOptions as RollupSeminarPluginOptions,
} from '@seminar/rollup-plugin';

import type { Plugin } from 'vite';

import { seminarEntries } from './entries.ts';
import { seminarHotReload } from './hotReload.ts';
import { createViteImporter } from './importModule.ts';
import {
  seminarSelfContained,
  type SelfContainedOptions,
} from './selfContained.ts';

export interface SeminarPluginOptions extends RollupSeminarPluginOptions {
  /**
   * Whether to turn `.deck.mdx` files into entry points with generated HTML
   * pages (see {@link seminarEntries}). Defaults to `true`.
   */
  entries?: boolean;
  /**
   * Whether `vite build` turns the generated page of each deck into a single,
   * self-contained HTML file, with all scripts, style sheets, fonts, and
   * other assets inlined (see {@link seminarSelfContained}). Defaults to
   * `true`. Disable it, e.g., when hosting decks with a Content Security
   * Policy that forbids inline scripts.
   *
   * Only applies if `entries` is enabled.
   */
  selfContained?: boolean | SelfContainedOptions | undefined;
}

/**
 * Compiles `.deck.mdx` files into `Deck` components (see
 * `@seminar/rollup-plugin`) and turns them into entry points with generated
 * HTML pages (see {@link seminarEntries}).
 *
 * With `@vitejs/plugin-react`, the dev server updates decks in place when they
 * change, keeping their state (see {@link seminarHotReload}).
 *
 * Theme modules that aren't packages with a compile-time config are imported
 * with the module runner of Vite to read their `seminar` export (see
 * `SeminarConfig` in `@seminar/core`). This takes about a second, so modules are
 * cached until one of their files changes.
 */
export default function seminar({
  entries = true,
  selfContained = true,
  ...options
}: SeminarPluginOptions = {}): Plugin[] {
  let root = process.cwd();
  const rollupPlugin: RollupSeminarPlugin = rollupSeminar({
    // Theme modules may be written in TypeScript and import style sheets.
    importModule: createViteImporter(() => root),
    ...options,
  });
  const mdx = rollupPlugin as unknown as Plugin;
  const setRoot: Plugin = {
    name: 'seminar:root',
    configResolved(config) {
      root = config.root;
    },
  };
  const hotReload = seminarHotReload({ include: options.include });
  if (!entries) {
    return [mdx, setRoot, hotReload];
  }
  return [
    mdx,
    setRoot,
    hotReload,
    seminarEntries({
      syntaxPlugins: (source, deckPath) =>
        rollupPlugin.syntaxPlugins(source, deckPath),
    }),
    ...(selfContained === false
      ? []
      : [seminarSelfContained(selfContained === true ? {} : selfContained)]),
  ];
}

export {
  seminarEntries,
  seminarHotReload,
  seminarSelfContained,
  type SelfContainedOptions,
};
