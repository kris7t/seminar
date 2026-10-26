import { defineCache, type CacheDefinition } from '@seminar/core';
import { forgetTextWidths, render } from 'pele/core';

import { annotate } from './annotate.ts';
import type { DiagramFormula } from './Diagram.tsx';

/**
 * Prefix of the ids in the SVG of cached diagrams, which each rendering of a
 * slide replaces with a prefix of its own, since a slide may be rendered
 * several times in the document, e.g., in the presenter view.
 */
export const ID_PLACEHOLDER = 'seminar-pele-id';

/**
 * Matches the placeholder where the SVG of Pele refers to ids, e.g., in
 * `id="…-title"`, `aria-labelledby="…-title"`, or `url(#…-sankey-…)`, but not
 * in text, which could happen to contain it.
 */
const ID_PATTERN = new RegExp(
  `(?<=(?: id="|url\\(#|href="#|aria-(?:labelledby|describedby)="(?:[^"]* )?))${ID_PLACEHOLDER}(?=-)`,
  'g',
);

/** What renders a diagram, see {@link diagramCache}. */
export interface DiagramInput {
  /** The Mermaid source of the diagram. */
  source: string;
  /** The formulas in the labels of the diagram, by their TeX. */
  formulas: Readonly<Record<string, DiagramFormula>>;
  /** The family of the font of the text, as in CSS. */
  fontFamily: string;
  /** The size of the font of the text, in pixels. */
  fontSize: number;
}

/** A diagram rendered by Pele, see {@link diagramCache}. */
export interface RenderedDiagram {
  /**
   * The SVG of the diagram, split where it has ids, which are joined with the
   * prefix of the ids of a rendering, see {@link joinIds}.
   */
  parts: readonly string[];
}

/** Splits `svg` where it refers to ids that start with {@link ID_PLACEHOLDER}. */
export function splitIds(svg: string): string[] {
  return svg.split(ID_PATTERN);
}

/** Returns the SVG of `diagram` with `prefix` as the prefix of its ids. */
export function joinIds(diagram: RenderedDiagram, prefix: string): string {
  return diagram.parts.join(prefix);
}

/** Variants of the font that Pele measures text in, as in the CSS `font`. */
const FONT_VARIANTS = ['', 'bold ', 'italic '];

/**
 * Loads the faces of the font that the text of `source` needs. Browsers only
 * load fonts once they lay out text that needs them, but Pele measures text
 * in a canvas, which doesn't wait for them.
 */
async function loadFonts({
  source,
  fontFamily,
  fontSize,
}: DiagramInput): Promise<void> {
  const { fonts } = document;
  // Not every environment loads fonts, e.g., jsdom.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (fonts === undefined) {
    return;
  }
  const unloaded = [...fonts].filter((face) => face.status !== 'loaded');
  await Promise.all(
    FONT_VARIANTS.map((variant) =>
      fonts.load(`${variant}${String(fontSize)}px ${fontFamily}`, source),
    ),
  );
  if (unloaded.some((face) => face.status === 'loaded')) {
    // Text measured before would have its width in a fallback font.
    forgetTextWidths();
  }
}

/**
 * Renders diagrams with Pele, which measures their text in the font of the
 * slide once it has loaded. Slides and their renderings share the results,
 * whose ids are joined with the prefix of each rendering.
 *
 * The types of diagrams must be registered with Pele before.
 */
export const diagramCache: CacheDefinition<DiagramInput, RenderedDiagram> =
  defineCache(
    async (input: DiagramInput): Promise<RenderedDiagram> => {
      await loadFonts(input);
      const { svg, type } = render(input.source, {
        fontFamily: input.fontFamily,
        fontSize: input.fontSize,
        idPrefix: ID_PLACEHOLDER,
        // Typeset when the deck was compiled, in ems.
        math: (tex, size) => {
          const formula = input.formulas[tex];
          return (
            formula && {
              svg: formula.svg,
              width: formula.width * size,
              height: formula.height * size,
            }
          );
        },
      });
      return { parts: splitIds(annotate(svg, type, input.source)) };
    },
    { transitionHold: 1000, maxUnusedEntries: 64 },
  );
