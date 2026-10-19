import { createTheme, type Theme, type ThemeOptions } from '@mui/material';
import type { TypographyVariantsOptions } from '@mui/material/styles';

import { ContentMaster } from '../masters/ContentMaster.tsx';
import { SectionMaster } from '../masters/SectionMaster.tsx';
import { SubsectionMaster } from '../masters/SubsectionMaster.tsx';
import { TitleMaster } from '../masters/TitleMaster.tsx';
import { SLIDE_ZOOM_PROPERTY } from '../view/slideZoom.ts';

/** Logical width of a slide in CSS pixels before scaling to the viewport. */
export const SLIDE_WIDTH = 1280;

/** Logical height of a slide in CSS pixels before scaling to the viewport. */
export const SLIDE_HEIGHT = 720;

/** A size in `em` in an `svg` element that sets its `font-size`. */
const SVG_EM = `calc(1em * var(${SLIDE_ZOOM_PROPERTY}, 1))`;

const slideThemeOptions: ThemeOptions = {
  components: {
    MuiSvgIcon: {
      styleOverrides: {
        // Icons are sized in `em`, but set their `font-size`, see
        // `SLIDE_ZOOM_PROPERTY`.
        root: { width: SVG_EM, height: SVG_EM },
      },
    },
  },
  master: {
    content: ContentMaster,
    title: TitleMaster,
    section: SectionMaster,
    subsection: SubsectionMaster,
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
 *
 * MUI components are sized in pixels rather than `rem`, which doesn't scale
 * with slides in WebKit, where slides are scaled with `zoom`. The sizes are
 * the same as MUI would give them in `rem`.
 */
export function createSlideTheme(...options: ThemeOptions[]): Theme {
  // MUI sizes the typography and components from the first options only, and
  // merges the others into the theme afterwards.
  const typography = slideThemeOptions.typography as TypographyVariantsOptions;
  const fontSize = typography.fontSize ?? 14;
  return createTheme(
    {
      ...slideThemeOptions,
      typography: {
        ...typography,
        // Supported by MUI, but missing from its types.
        pxToRem: (size: number) => `${String((size * fontSize) / 14)}px`,
      } as TypographyVariantsOptions,
    },
    ...options,
  );
}

export const defaultSlideTheme: Theme = createSlideTheme();
