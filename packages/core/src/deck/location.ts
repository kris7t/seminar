import type { StepPath } from '../steps/StepStore.ts';

/** A location in a deck that can be stored in the location hash. */
export interface DeckLocation {
  /** Zero-based index of the slide. */
  slideIndex: number;
  /** Path of the current step on the slide. */
  step: StepPath;
  /**
   * Name of the step group whose first step `step` is relative to, if any
   * (see `StepTarget`).
   */
  group?: string | undefined;
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
  aliases: ReadonlyMap<string, number>,
): number | undefined {
  const match = SLIDE_NUMBER_PATTERN.exec(slide);
  if (match?.[1] !== undefined) {
    return Math.max(Number.parseInt(match[1], 10) - 1, 0);
  }
  const index = slideIds.indexOf(slide);
  return index >= 0 ? index : aliases.get(slide);
}

const NUMBER_PATTERN = /^\d+$/;

function parseStep(
  step: string | undefined,
): Pick<DeckLocation, 'step' | 'group'> {
  const path: number[] = [];
  if (step === undefined || step === '') {
    return { step: path };
  }
  const [first = '', ...rest] = step.split('.');
  // A step path may start with the name of a group instead of a number.
  const group = NUMBER_PATTERN.test(first) ? undefined : first;
  for (const segment of group === undefined ? [first, ...rest] : rest) {
    if (!NUMBER_PATTERN.test(segment)) {
      break;
    }
    path.push(Number.parseInt(segment, 10));
  }
  return group === undefined ? { step: path } : { step: path, group };
}

/**
 * Parses a location hash of the form `#<slide>` or `#<slide>&step=<path>`.
 *
 * `<slide>` is either the id of a slide, one of the `aliases` of the slides,
 * or `slide=<n>` with a 1-based slide number. `<path>` is a step path with dot-separated step numbers, e.g., `2.1`
 * (see {@link StepPath}), which may start with the name of a step group
 * instead, e.g., `parse` for its first step, or `parse.1` for the first step
 * nested in it. Invalid parts of the step path are dropped.
 *
 * @returns `undefined` if the hash does not refer to a slide.
 */
export function parseLocation(
  hash: string,
  slideIds: readonly (string | undefined)[],
  aliases: ReadonlyMap<string, number> = new Map(),
): DeckLocation | undefined {
  const fragment = hash.startsWith('#') ? hash.slice(1) : hash;
  const [slide = '', ...params] = fragment.split('&').map(decode);
  const slideIndex = parseSlide(slide, slideIds, aliases);
  if (slideIndex === undefined) {
    return undefined;
  }
  const step = params
    .find((param) => param.startsWith(STEP_PARAM))
    ?.slice(STEP_PARAM.length);
  return { slideIndex, ...parseStep(step) };
}

/** Formats a location hash that can be parsed by {@link parseLocation}. */
export function formatLocation(
  { slideIndex, step, group }: DeckLocation,
  slideIds: readonly (string | undefined)[],
): string {
  const id = slideIds[slideIndex];
  const slide =
    id === undefined
      ? `slide=${String(slideIndex + 1)}`
      : encodeURIComponent(id);
  const segments = [
    ...(group === undefined ? [] : [encodeURIComponent(group)]),
    ...step.map(String),
  ];
  return segments.length === 0
    ? `#${slide}`
    : `#${slide}&step=${segments.join('.')}`;
}
