import { createTheme, type Theme, type ThemeOptions } from '@mui/material';

import { ContentMaster } from '../masters/ContentMaster.tsx';
import { TitleMaster } from '../masters/TitleMaster.tsx';

/** Logical width of a slide in CSS pixels before scaling to the viewport. */
export const SLIDE_WIDTH = 1280;

/** Logical height of a slide in CSS pixels before scaling to the viewport. */
export const SLIDE_HEIGHT = 720;

const slideThemeOptions: ThemeOptions = {
  master: {
    content: ContentMaster,
    title: TitleMaster,
  },
  typography: {
    fontSize: 24,
    h1: { fontSize: 64, fontWeight: 500, lineHeight: 1.15 },
    h2: { fontSize: 48, fontWeight: 500, lineHeight: 1.2 },
    h3: { fontSize: 40, fontWeight: 500, lineHeight: 1.2 },
    h4: { fontSize: 32, fontWeight: 500, lineHeight: 1.25 },
    h5: { fontSize: 28, fontWeight: 500, lineHeight: 1.3 },
    h6: { fontSize: 24, fontWeight: 500, lineHeight: 1.3 },
    subtitle1: { fontSize: 32, lineHeight: 1.4 },
    subtitle2: { fontSize: 28, lineHeight: 1.4 },
    body1: { fontSize: 28, lineHeight: 1.5 },
    body2: { fontSize: 24, lineHeight: 1.5 },
    caption: { fontSize: 18, lineHeight: 1.4 },
  },
};

/**
 * Creates a MUI theme with typography sized for slides and the built-in
 * slide masters.
 *
 * Additional options are merged on top of the slide defaults, so further
 * masters can be added with the `master` option.
 */
export function createSlideTheme(...options: ThemeOptions[]): Theme {
  return createTheme(slideThemeOptions, ...options);
}

export const defaultSlideTheme: Theme = createSlideTheme();
