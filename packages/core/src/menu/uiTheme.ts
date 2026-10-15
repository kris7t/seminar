import { createTheme, type Theme } from '@mui/material';

/**
 * Theme of the user interface of the deck, such as menus and dialogs.
 *
 * Unlike the slide theme, which is sized for the scaled slide canvas, this
 * uses regular MUI sizes.
 */
export const uiTheme: Theme = createTheme();

/**
 * Dark variant of the {@link uiTheme} for the parts of the user interface on
 * dark backgrounds, like the panel and the toolbar of the presenter view, so
 * that, e.g., disabled and selected buttons stay visible.
 */
export const darkUiTheme: Theme = createTheme({
  palette: {
    mode: 'dark',
    background: { default: '#212121', paper: '#212121' },
  },
});
