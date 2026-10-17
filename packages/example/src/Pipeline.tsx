import { Box, Typography } from '@mui/material';
import {
  useOwnAnimation,
  useStep,
  useStepTransition,
  useTransitionHold,
  type StepHandle,
} from '@slider/core';
import { useEffect, useState, type JSX } from 'react';

const STAGE_WIDTH = 240;
const STAGE_GAP = 80;

/** How long the slide pauses before showing the last stage, in milliseconds. */
const DISPLAY_DELAY = 500;

/**
 * Shows the stages of compiling a deck, which join the step groups `parse`,
 * `render`, and `display` of the slide, e.g., of list items that explain
 * them.
 *
 * The stages light up with their groups, which fades with the slide like
 * the list items. The marker below them moves to the last stage reached with
 * an animation of its own instead, which it keeps out of the fade of the
 * slide with `useOwnAnimation`. It moves for as long as the slide fades,
 * which `useStepTransition` tells, e.g., slowly for a step with `fadeBefore=800`,
 * and jumps where the slide changes at once, e.g., in thumbnails.
 *
 * Going forward to the last stage, the slide pauses for a moment first: the
 * component holds the change with `useTransitionHold`, so the rest of the
 * slide waits, too. The marker starts moving once the slide is shown, since
 * the views start the animations of a change over then.
 */
export function Pipeline(): JSX.Element {
  // Each stage is in the group of its step, so it's placed in the steps where
  // it's in the document, before the list items of the group.
  const stages: [string, StepHandle][] = [
    ['Markdown', useStep({ group: 'parse' })],
    ['Syntax tree', useStep({ group: 'render' })],
    ['React elements', useStep({ group: 'display' })],
  ];
  const reached = stages.findLastIndex(([, step]) => step.isActive);
  // Move along with the fade of the slide, for as long as the steps say, and
  // jump where the slide changes at once, e.g., in thumbnails, or for cuts.
  const { duration, easing, forward, skipped } = useStepTransition();
  const ownAnimation = useOwnAnimation();
  // Pause before the last stage, but not when jumping to it, where the
  // slide changes at once, or when the presenter goes on meanwhile.
  const pauses =
    forward && duration > 0 && !skipped && reached === stages.length - 1;
  const [paused, setPaused] = useState(false);
  if (!pauses && paused) {
    setPaused(false);
  }
  useEffect(() => {
    if (!pauses) return undefined;
    const timeout = setTimeout(() => {
      setPaused(true);
    }, DISPLAY_DELAY);
    return () => {
      clearTimeout(timeout);
    };
  }, [pauses]);
  // The marker starts moving once the slide is shown.
  useTransitionHold(pauses && !paused, { deadline: DISPLAY_DELAY + 100 });
  return (
    <Box
      sx={{
        position: 'relative',
        mt: 4,
        // Room for the marker below the stages.
        mb: 8,
        mx: 'auto',
        width: 'fit-content',
      }}
    >
      <Box sx={{ display: 'flex', gap: `${String(STAGE_GAP)}px` }}>
        {stages.map(([label, step]) => (
          <Box
            key={label}
            ref={step.ref}
            sx={{
              width: STAGE_WIDTH,
              py: 2,
              border: 2,
              borderRadius: 2,
              textAlign: 'center',
              // Changes at once, and fades with the slide.
              borderColor: step.isActive ? 'primary.main' : 'divider',
              color: step.isActive ? 'primary.main' : 'text.disabled',
            }}
          >
            <Typography variant="h6" component="div" color="inherit">
              {label}
            </Typography>
          </Box>
        ))}
      </Box>
      <Box
        aria-hidden
        style={ownAnimation}
        sx={{
          position: 'absolute',
          top: '100%',
          left: STAGE_WIDTH / 2 - 12,
          mt: 1.5,
          width: 24,
          height: 24,
          borderRadius: '50%',
          bgcolor: 'secondary.main',
          // The marker appears and moves by itself, since it doesn't fade
          // with the slide.
          opacity: reached < 0 ? 0 : 1,
          transform: `translateX(${String(Math.max(reached, 0) * (STAGE_WIDTH + STAGE_GAP))}px)`,
          transition: ['transform', 'opacity']
            .map((property) => `${property} ${String(duration)}ms ${easing}`)
            .join(', '),
        }}
      />
    </Box>
  );
}
