import type { MathFont } from './fonts.ts';
import type { renderFormula } from './render.ts';

/** Math in the browser, which decks enable with `dynamic`. */
export interface RuntimeDynamicMath {
  /** The font of the deck. */
  font: MathFont;
  /** Imports the renderer, `@seminar/plugin-mathjax/render`. */
  loadRenderer: () => Promise<{ renderFormula: typeof renderFormula }>;
}

/**
 * The `math` options of a deck in the browser, which `useSeminarOptions` of
 * `@seminar/core` returns in decks compiled with this plugin.
 */
export interface RuntimeMathOptions {
  /** The name of the font, like `stix2`. */
  font: string;
  macros: Record<string, string | [string, number]>;
  tags: 'none' | 'ams' | 'all';
  /** Math in the browser, if the deck enables `dynamic` math. */
  dynamic: RuntimeDynamicMath | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Checks that the `math` options of a deck were set by this plugin. */
export function isRuntimeMathOptions(
  value: unknown,
): value is RuntimeMathOptions {
  return (
    isRecord(value) &&
    typeof value['font'] === 'string' &&
    isRecord(value['macros']) &&
    typeof value['tags'] === 'string'
  );
}
