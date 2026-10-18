/** Imports a module, as `() => import('…')` does. */
export type ModuleLoader = () => Promise<unknown>;

/**
 * A MathJax font for rendering math in the browser, which loads its glyphs
 * only when formulas need them.
 */
export interface MathFont {
  /** Imports the module of the SVG font, like `mjs/svg.js` of the package. */
  readonly loadFont: ModuleLoader;
  /** Imports a file of more glyphs, like `arrows.js`, by its name. */
  readonly loadDynamicFile: (name: string) => Promise<unknown>;
}

/** Returns the name of a file from its path, like `arrows.js`. */
function baseName(file: string): string {
  return file.slice(file.lastIndexOf('/') + 1);
}

/**
 * Defines a MathJax font from the module of its SVG font and the files of its
 * glyphs in its `mjs/svg/dynamic` directory, by their names, like
 * `arrows.js`. Compiled decks define their fonts with it.
 */
export function defineMathFont(
  loadFont: ModuleLoader,
  dynamicFiles: Record<string, ModuleLoader>,
): MathFont {
  return {
    loadFont,
    loadDynamicFile: (name) => {
      const file = baseName(name);
      const load = Object.hasOwn(dynamicFiles, file)
        ? dynamicFiles[file]
        : undefined;
      return load === undefined
        ? Promise.reject(new Error(`The deck has no glyphs ${name}`))
        : load();
    },
  };
}
