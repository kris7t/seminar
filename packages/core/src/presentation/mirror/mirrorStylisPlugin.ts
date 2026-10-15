import type { StylisPlugin } from '@emotion/cache';

/** Attributes that mark the elements matching the mirrored pseudo-classes. */
export const MIRROR_ATTRIBUTES = {
  hover: 'data-mirror-hover',
  focus: 'data-mirror-focus',
  focusVisible: 'data-mirror-focus-visible',
  focusWithin: 'data-mirror-focus-within',
} as const;

const REPLACEMENTS: readonly [RegExp, string][] = [
  [/:hover\b/g, `:is(:hover,[${MIRROR_ATTRIBUTES.hover}])`],
  [
    /:focus-visible\b/g,
    `:is(:focus-visible,[${MIRROR_ATTRIBUTES.focusVisible}])`,
  ],
  [/:focus-within\b/g, `:is(:focus-within,[${MIRROR_ATTRIBUTES.focusWithin}])`],
  [/:focus(?![-\w])/g, `:is(:focus,[${MIRROR_ATTRIBUTES.focus}])`],
];

/** Makes rules for hover and focus also apply to the marked elements. */
export function rewriteSelector(selector: string): string {
  let result = selector;
  for (const [pattern, replacement] of REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Rewrites the styles of a window that shows the slides to the audience, so
 * that rules for `:hover`, `:focus`, `:focus-visible`, and `:focus-within`
 * also apply to the elements marked with the {@link MIRROR_ATTRIBUTES}, which
 * mirror the elements the presenter interacts with.
 *
 * Browsers don't let pages set these states, and the audience window can't
 * get the focus without taking it away from the presenter.
 */
export const mirrorStylisPlugin: StylisPlugin = (element) => {
  if (element.type === 'rule' && Array.isArray(element.props)) {
    element.props = element.props.map(rewriteSelector);
  }
};
