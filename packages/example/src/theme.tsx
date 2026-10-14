import { Stack, Typography } from '@mui/material';
import { createSlideTheme, type SlideMasterProps } from '@slider/core';
import type { JSX } from 'react';

/** Master added to the theme, so that slides can refer to it by name. */
function SectionMaster({ title, children }: SlideMasterProps): JSX.Element {
  return (
    <Stack
      component="section"
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
  children,
}: SlideMasterProps): JSX.Element {
  return (
    <Stack
      component="section"
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

export const theme = createSlideTheme({
  palette: {
    primary: { main: '#00639b' },
    secondary: { main: '#b3261e' },
  },
  master: {
    section: SectionMaster,
  },
  components: {
    SliderSlideNumber: {
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
