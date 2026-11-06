import { createTheme, type Theme, type ThemeOptions } from '@mui/material';
import type { Palette, TypographyVariantsOptions } from '@mui/material/styles';
import deepmerge from '@mui/utils/deepmerge';
import type { CSSProperties } from 'react';

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

/** The font size of slides that the sizes in {@link slideVariants} are for. */
const SLIDE_FONT_SIZE = 24;

/**
 * Typography variants sized for slides, which replace those of MUI. Like
 * MUI's own, they scale with `fontSize`, take their weight from
 * `fontWeightMedium`, and `allVariants` applies on top of them.
 */
function slideVariants({
  fontSize = 14,
  fontWeightMedium = 500,
  allVariants,
}: TypographyVariantsOptions): TypographyVariantsOptions {
  const variant = (
    size: number,
    lineHeight: number,
    fontWeight?: CSSProperties['fontWeight'],
  ) => ({
    fontSize: (size * fontSize) / SLIDE_FONT_SIZE,
    lineHeight,
    ...(fontWeight === undefined ? {} : { fontWeight }),
    ...allVariants,
  });
  return {
    h1: variant(64, 1.15, fontWeightMedium),
    h2: variant(48, 1.2, fontWeightMedium),
    h3: variant(40, 1.2, fontWeightMedium),
    h4: variant(32, 1.25, fontWeightMedium),
    h5: variant(28, 1.3, fontWeightMedium),
    h6: variant(24, 1.3, fontWeightMedium),
    subtitle1: variant(32, 1.4),
    subtitle2: variant(28, 1.4),
    body1: variant(28, 1.5),
    body2: variant(24, 1.5),
    caption: variant(18, 1.4),
  };
}

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
  typography: { fontSize: SLIDE_FONT_SIZE },
};

/**
 * Creates a MUI theme with typography sized for slides and the built-in
 * slide masters.
 *
 * Additional options are merged on top of the slide defaults.
 *
 * MUI components are sized in pixels rather than `rem`, which doesn't scale
 * with slides in WebKit, where slides are scaled with `zoom`. The sizes are
 * the same as MUI would give them in `rem`.
 */
export function createSlideTheme(...options: ThemeOptions[]): Theme {
  // MUI derives the palette, typography, and spacing from the first options
  // only, and merges the others into the theme afterwards as they are, so we
  // merge all options into the first.
  const allOptions = [slideThemeOptions, ...options];
  const merged = allOptions.reduce<ThemeOptions>(
    (acc, option) => deepmerge(acc, { ...option, typography: undefined }),
    {},
  );
  return createTheme({
    ...merged,
    typography: (palette: Palette) => {
      const typography = allOptions.reduce<TypographyVariantsOptions>(
        (acc, { typography: option = {} }) =>
          deepmerge(
            acc,
            typeof option === 'function' ? option(palette) : option,
          ),
        {},
      );
      const fontSize = typography.fontSize ?? 14;
      return {
        ...deepmerge(slideVariants(typography), typography),
        // Supported by MUI, but missing from its types.
        pxToRem: (size: number) => `${String((size * fontSize) / 14)}px`,
      } as TypographyVariantsOptions;
    },
  });
}

export const defaultSlideTheme: Theme = createSlideTheme();
