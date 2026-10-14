// Roboto is the default font of MUI. Bundle it so that presentations work
// offline. Themes not based on this one don't load it.
import '@fontsource/roboto/300.css';
import '@fontsource/roboto/300-italic.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/400-italic.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/500-italic.css';
import '@fontsource/roboto/700.css';
import '@fontsource/roboto/700-italic.css';

import type { Theme } from '@mui/material';
import { createSlideTheme } from '@slider/core';

/** The default theme of slider decks, with the Roboto font. */
const theme: Theme = createSlideTheme();

export default theme;
