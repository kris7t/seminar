import { Box, ThemeProvider } from '@mui/material';
import type { JSX, ReactNode } from 'react';

import { darkUiTheme, uiTheme } from './uiTheme.ts';

export interface UiThemeProviderProps {
  /** Whether to use the {@link darkUiTheme} instead of the {@link uiTheme}. */
  dark?: boolean;
  children?: ReactNode;
}

/**
 * Provides the theme of the user interface to `children`, and the matching
 * `color-scheme`, so that the browser draws their scrollbars and form
 * controls in light or dark, too.
 *
 * Doesn't add a box to the layout. Elements rendered in a portal, like menus,
 * get the theme, but not the color scheme.
 */
export function UiThemeProvider({
  dark = false,
  children,
}: UiThemeProviderProps): JSX.Element {
  return (
    <ThemeProvider theme={dark ? darkUiTheme : uiTheme}>
      <Box sx={{ display: 'contents', colorScheme: dark ? 'dark' : 'light' }}>
        {children}
      </Box>
    </ThemeProvider>
  );
}
