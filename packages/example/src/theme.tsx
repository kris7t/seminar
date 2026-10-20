// Roboto is the default font of MUI. Bundle it so that the presentation works offline.
import '@fontsource/roboto/300.css';
import '@fontsource/roboto/300-italic.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/400-italic.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/500-italic.css';
import '@fontsource/roboto/700.css';
import '@fontsource/roboto/700-italic.css';

import { Stack, Typography } from '@mui/material';
import { createSlideTheme, type SlideMasterProps } from '@seminar/core';
import type { JSX } from 'react';

/** Replaces the built-in `section` master of the theme. */
function SectionMaster({
  title,
  className,
  children,
}: SlideMasterProps): JSX.Element {
  return (
    <Stack
      component="section"
      className={className}
      sx={{
        height: '100%',
        justifyContent: 'center',
        gap: 2,
        px: 10,
        bgcolor: 'primary.main',
        color: 'primary.contrastText',
      }}
    >
      <Typography variant="h2" component="h1">
        {title}
      </Typography>
      {children}
    </Stack>
  );
}

/** Master passed directly to a single slide, rather than through the theme. */
export function ClosingMaster({
  title,
  className,
  children,
}: SlideMasterProps): JSX.Element {
  return (
    <Stack
      component="section"
      className={className}
      sx={{
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        textAlign: 'center',
      }}
    >
      <Typography variant="h1" component="h1" color="primary">
        {title}
      </Typography>
      {children}
    </Stack>
  );
}

// Have a long fade out from sections.
SectionMaster.fadeAfter = 600;
SectionMaster.cut = 'in' as const;

export const theme = createSlideTheme({
  palette: {
    primary: { main: '#00639b' },
    secondary: { main: '#b3261e' },
  },
  master: {
    section: SectionMaster,
  },
  components: {
    SeminarSlideNumber: {
      styleOverrides: {
        root: ({ theme }) => ({
          color: '#fff',
          backgroundColor: theme.palette.primary.main,
          padding: 2,
        }),
      },
    },
  },
});

export default theme;
