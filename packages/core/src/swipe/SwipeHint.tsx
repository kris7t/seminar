import { Box, Fade, Typography } from '@mui/material';
import type { JSX } from 'react';

export interface SwipeHintProps {
  open: boolean;
}

/**
 * Tells that the current slide has more steps when it's swiped past them.
 *
 * Should be rendered with the {@link uiTheme}.
 */
export function SwipeHint({ open }: SwipeHintProps): JSX.Element {
  return (
    <Box
      role="status"
      sx={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 2,
        pointerEvents: 'none',
      }}
    >
      <Fade in={open}>
        <Typography
          variant="body2"
          sx={{
            maxWidth: '50vw',
            px: 2,
            py: 1.5,
            borderRadius: 2,
            bgcolor: 'rgb(0 0 0 / 80%)',
            color: 'common.white',
            textAlign: 'center',
          }}
        >
          This slide has more steps. Tap to go through them.
        </Typography>
      </Fade>
    </Box>
  );
}
