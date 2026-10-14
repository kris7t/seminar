import type { StepPath } from '../steps/StepStore.ts';

/** A location in a deck that can be stored in the location hash. */
export interface DeckLocation {
  /** Zero-based index of the slide. */
  slideIndex: number;
  /** Path of the current step on the slide. */
  step: StepPath;
}

const SLIDE_NUMBER_PATTERN = /^slide=(\d+)$/;

const STEP_PARAM = 'step=';

function decode(component: string): string {
  try {
    return decodeURIComponent(component);
  } catch {
    return component;
  }
}

function parseSlide(
  slide: string,
  slideIds: readonly (string | undefined)[],
): number | undefined {
  const match = SLIDE_NUMBER_PATTERN.exec(slide);
  if (match?.[1] !== undefined) {
    return Math.max(Number.parseInt(match[1], 10) - 1, 0);
  }
  const index = slideIds.indexOf(slide);
  return index >= 0 ? index : undefined;
}

function parseStep(step: string | undefined): StepPath {
  const path: number[] = [];
  if (step === undefined || step === '') {
    return path;
  }
  for (const segment of step.split('.')) {
    if (!/^\d+$/.test(segment)) {
      break;
    }
    path.push(Number.parseInt(segment, 10));
  }
  return path;
}

/**
 * Parses a location hash of the form `#<slide>` or `#<slide>&step=<path>`.
 *
 * `<slide>` is either the id of a slide or `slide=<n>` with a 1-based slide
 * number. `<path>` is a step path with dot-separated step numbers, e.g., `2.1`
 * (see {@link StepPath}). Invalid parts of the step path are dropped.
 *
 * @returns `undefined` if the hash does not refer to a slide.
 */
export function parseLocation(
  hash: string,
  slideIds: readonly (string | undefined)[],
): DeckLocation | undefined {
  const fragment = hash.startsWith('#') ? hash.slice(1) : hash;
  const [slide = '', ...params] = fragment.split('&').map(decode);
  const slideIndex = parseSlide(slide, slideIds);
  if (slideIndex === undefined) {
    return undefined;
  }
  const step = params
    .find((param) => param.startsWith(STEP_PARAM))
    ?.slice(STEP_PARAM.length);
  return { slideIndex, step: parseStep(step) };
}

/** Formats a location hash that can be parsed by {@link parseLocation}. */
export function formatLocation(
  { slideIndex, step }: DeckLocation,
  slideIds: readonly (string | undefined)[],
): string {
  const id = slideIds[slideIndex];
  const slide =
    id === undefined
      ? `slide=${String(slideIndex + 1)}`
      : encodeURIComponent(id);
  return step.length === 0 ? `#${slide}` : `#${slide}&step=${step.join('.')}`;
}
