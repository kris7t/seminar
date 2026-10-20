import { GlobalStyles } from '@mui/material';
import type { JSX } from 'react';

import {
  DURATION_PROPERTY,
  getFadeTransition,
  OWN_ANIMATION_CLASS,
  POINTER_TRANSITION_NAME,
  SLIDE_TRANSITION_NAME,
  SNAPSHOT_OFFSET_PROPERTY,
  TRANSITION_ATTRIBUTE,
  TRANSITION_FRAME_ATTRIBUTE,
} from './SlideTransitions.ts';

const running = `[${TRANSITION_ATTRIBUTE}]`;
const stepFade = `[${TRANSITION_ATTRIBUTE}=step]`;

/**
 * Styles of the view transitions of `SlideTransitions`, which must be in
 * every document with a slide frame that fades.
 *
 * The slide fades as the `stepTransition` and `slideTransition` of the theme
 * say.
 */
export function SlideTransitionStyles(): JSX.Element {
  return (
    <GlobalStyles
      styles={(theme) => ({
        // Only the slide fades in transitions of the whole document.
        [`html${running}`]: { viewTransitionName: 'none' },
        [`${running} [${TRANSITION_FRAME_ATTRIBUTE}]`]: {
          viewTransitionName: SLIDE_TRANSITION_NAME,
        },
        // Snapshots of transitions scoped to the frame are in the wrong place in
        // some browsers.
        [`${running}::view-transition-group(root)`]: {
          translate: `var(${SNAPSHOT_OFFSET_PROPERTY}, 0 0)`,
        },
        ...Object.fromEntries(
          (['step', 'slide'] as const).map((kind) => {
            const fade = `[${TRANSITION_ATTRIBUTE}=${kind}]`;
            const { duration, easing } = getFadeTransition(theme, kind);
            return [
              `${fade}::view-transition-group(*), ${fade}::view-transition-old(*), ${fade}::view-transition-new(*)`,
              {
                animationDuration: `var(${DURATION_PROPERTY}, ${String(duration)}ms)`,
                animationTimingFunction: easing,
              },
            ];
          }),
        ),
        // The pointer keeps following the mouse instead of fading.
        [`${running} [data-slider-pointer]`]: {
          viewTransitionName: POINTER_TRANSITION_NAME,
          viewTransitionClass: OWN_ANIMATION_CLASS,
        },
        // Elements that animate themselves with the steps show how they are at
        // once, but fade with the slide when the slide changes.
        [`${stepFade}::view-transition-group(*.${OWN_ANIMATION_CLASS}), ${stepFade}::view-transition-new(*.${OWN_ANIMATION_CLASS})`]:
          { animation: 'none' },
        [`${stepFade}::view-transition-old(*.${OWN_ANIMATION_CLASS})`]: {
          display: 'none',
        },
        // Also for browsers without view transition classes.
        [`${running}::view-transition-group(${POINTER_TRANSITION_NAME}), ${running}::view-transition-new(${POINTER_TRANSITION_NAME})`]:
          { animation: 'none' },
        [`${running}::view-transition-old(${POINTER_TRANSITION_NAME})`]: {
          display: 'none',
        },
      })}
    />
  );
}
