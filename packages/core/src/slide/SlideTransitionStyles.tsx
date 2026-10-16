import { GlobalStyles } from '@mui/material';
import type { JSX } from 'react';

import {
  getStepTransition,
  OWN_ANIMATION_CLASS,
  POINTER_TRANSITION_NAME,
  SLIDE_TRANSITION_NAME,
  TRANSITION_ATTRIBUTE,
  TRANSITION_FRAME_ATTRIBUTE,
} from './SlideTransitions.ts';

const running = `[${TRANSITION_ATTRIBUTE}]`;

/**
 * Styles of the view transitions of `SlideTransitions`, which must be in
 * every document with a slide frame that fades.
 *
 * The slide fades as the `stepTransition` of the theme says.
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
        [`${running}::view-transition-group(*), ${running}::view-transition-old(*), ${running}::view-transition-new(*)`]:
          {
            animationDuration: `${String(getStepTransition(theme).duration)}ms`,
            animationTimingFunction: getStepTransition(theme).easing,
          },
        // The pointer keeps following the mouse instead of fading.
        [`${running} [data-slider-pointer]`]: {
          viewTransitionName: POINTER_TRANSITION_NAME,
          viewTransitionClass: OWN_ANIMATION_CLASS,
        },
        // Elements that animate themselves show how they are at once.
        [`${running}::view-transition-group(*.${OWN_ANIMATION_CLASS}), ${running}::view-transition-new(*.${OWN_ANIMATION_CLASS})`]:
          { animation: 'none' },
        [`${running}::view-transition-old(*.${OWN_ANIMATION_CLASS})`]: {
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
