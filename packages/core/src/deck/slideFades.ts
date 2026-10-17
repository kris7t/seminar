import { isValidElement, type ReactNode } from 'react';

import type { SlideMaster, SlideMasters } from '../masters/SlideMaster.ts';
import {
  fadesOf,
  NO_CUTS,
  parseCuts,
  pickFade,
  sidesOf,
  type Fade,
  type FadeValues,
  type FadeSide,
} from '../slide/fades.ts';

type FadeSource = FadeValues;

/** The props of `slide` and its master in `masters`, if it's a `Slide`. */
function propsOf(
  slide: ReactNode,
  masters: SlideMasters,
): { props: FadeSource; master: FadeSource | undefined } {
  if (!isValidElement<FadeSource & { master?: unknown }>(slide)) {
    return { props: {}, master: undefined };
  }
  const { master = 'content' } = slide.props;
  return {
    props: slide.props,
    master:
      typeof master === 'string'
        ? masters[master]
        : (master as SlideMaster | undefined),
  };
}

/**
 * Returns the fades that `slide` sets for its `sides`: those of the slide
 * itself, and less explicitly, those of its master.
 */
function slideFadesOf(
  slide: ReactNode,
  masters: SlideMasters,
  sides: readonly FadeSide[],
): Fade[] {
  const { props, master } = propsOf(slide, masters);
  return [
    ...fadesOf(props, sides, 2),
    // The `cut` of the slide replaces that of its master, e.g., `cut=false`.
    ...(master === undefined
      ? []
      : fadesOf(
          master,
          sides,
          0,
          parseCuts(props.cut) === undefined ? undefined : NO_CUTS,
        )),
  ];
}

/**
 * Returns how long `slide` fades from one step to another: its `fade`, or
 * that of its master, or `undefined` for that of the theme.
 */
export function getStepFade(
  slide: ReactNode,
  masters: SlideMasters,
): number | undefined {
  return pickFade(slideFadesOf(slide, masters, []));
}

/**
 * Returns how long the slide `from` fades into the slide `to`, which comes
 * after it in the deck if `forward`: the most explicit of the fades that
 * either of them sets for the sides crossed, 0 if one of those cuts, or else
 * the longest of those, or `undefined` for that of the theme.
 */
export function getFadeBetween(
  from: ReactNode,
  to: ReactNode,
  forward: boolean,
  masters: SlideMasters,
): number | undefined {
  return pickFade([
    ...slideFadesOf(from, masters, sidesOf(true, forward)),
    ...slideFadesOf(to, masters, sidesOf(false, forward)),
  ]);
}
