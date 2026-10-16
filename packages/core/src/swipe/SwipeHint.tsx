import { Box, Fade, Typography } from '@mui/material';
import type { JSX } from 'react';

import { useUiLanguage } from '../i18n/UiLanguageContext.ts';

export interface SwipeHintProps {
  open: boolean;
}

/**
 * Tells that the current slide has more steps when it's swiped past them.
 *
 * Fills and is centered on its containing block, which should be the area of
 * the slides, so that it doesn't cover other parts of the window, like the
 * panel of the presenter view.
 *
 * Should be rendered with the {@link uiTheme}.
 */
export function SwipeHint({ open }: SwipeHintProps): JSX.Element {
  const { lang, t } = useUiLanguage();
  return (
    <Box
      role="status"
      lang={lang}
      sx={{
        position: 'absolute',
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
            maxWidth: '50%',
            px: 2,
            py: 1.5,
            borderRadius: 2,
            bgcolor: 'rgb(0 0 0 / 80%)',
            color: 'common.white',
            textAlign: 'center',
          }}
        >
          {t('moreSteps')}
        </Typography>
      </Fade>
    </Box>
  );
}
