import type { SxProps, Theme } from '@mui/material';

import { SLIDE_HEIGHT, SLIDE_WIDTH } from '../theme/createSlideTheme.ts';

/**
 * Styles of a slide in the middle of the area of the slides, which should be
 * scaled with a `transform` to fit.
 */
export const SLIDE_FRAME_STYLES: SxProps<Theme> = {
  position: 'absolute',
  left: `calc(50% - ${String(SLIDE_WIDTH / 2)}px)`,
  top: `calc(50% - ${String(SLIDE_HEIGHT / 2)}px)`,
  width: SLIDE_WIDTH,
  height: SLIDE_HEIGHT,
  overflow: 'hidden',
  bgcolor: 'background.default',
  color: 'text.primary',
};
