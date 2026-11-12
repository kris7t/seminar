import {
  decomposeColor,
  recomposeColor,
  type Palette,
  type PaletteColor,
  type Theme,
  type TypeText,
} from '@mui/material/styles';

/**
 * Keys of the MUI theme palette whose values are palette colors, like
 * `primary`, or text colors of the palette, like `text.secondary`.
 */
export type ElementColor =
  | {
      [Key in keyof Palette]: Palette[Key] extends PaletteColor ? Key : never;
    }[keyof Palette]
  | `text.${Extract<keyof TypeText, string>}`;

export interface PaletteColorLike {
  main: string;
  light?: string | undefined;
  dark?: string | undefined;
  contrastText?: string | undefined;
}

export function paletteColor(
  palette: Palette,
  color: string,
): PaletteColorLike | undefined {
  const value = (palette as unknown as Record<PropertyKey, unknown>)[color];
  return typeof value === 'object' &&
    value !== null &&
    'main' in value &&
    typeof value.main === 'string'
    ? (value as PaletteColorLike)
    : undefined;
}

/** Composes a translucent `color` over `background` into an opaque color. */
function opaque(color: string, background: string): string {
  const { values } = decomposeColor(color);
  const alpha = values[3] ?? 1;
  if (alpha >= 1) return color;
  const under = decomposeColor(background).values;
  return recomposeColor({
    type: 'rgb',
    values: [0, 1, 2].map((i) =>
      Math.round((values[i] ?? 0) * alpha + (under[i] ?? 0) * (1 - alpha)),
    ) as [number, number, number],
  });
}

/**
 * Palette colors for the text colors of the palette, opaque over the paper
 * background, so that filled elements don't let the slide show through.
 */
export function textColors(
  palette: Palette,
): [ElementColor, PaletteColorLike][] {
  return Object.entries(palette.text).flatMap(([key, value]) => {
    if (typeof value !== 'string') return [];
    let main: string;
    try {
      main = opaque(value, palette.background.paper);
    } catch {
      return [];
    }
    return [[`text.${key}` as ElementColor, { main }]];
  });
}

/**
 * Returns style variants that set the `--<name>-palette-main`, `-light`,
 * `-dark`, and `-contrastText` CSS variables of each `color` of the palette
 * of `theme`, and the variables that `extra` returns for the color, for the
 * styles of the component `name` to use.
 */
export function paletteColorVariants(
  theme: Theme,
  name: string,
  extra?: (selected: PaletteColorLike) => Record<string, string>,
): { props: { color: ElementColor }; style: Record<string, string> }[] {
  const colors: [ElementColor, PaletteColorLike][] = [
    ...Object.keys(theme.palette).flatMap(
      (color): [ElementColor, PaletteColorLike][] => {
        const selected = paletteColor(theme.palette, color);
        return selected === undefined
          ? []
          : [[color as ElementColor, selected]];
      },
    ),
    ...textColors(theme.palette),
  ];
  return colors.map(([color, selected]) => ({
    props: { color },
    style: {
      [`--${name}-palette-main`]: selected.main,
      [`--${name}-palette-light`]: selected.light ?? selected.main,
      [`--${name}-palette-dark`]: selected.dark ?? selected.main,
      [`--${name}-palette-contrastText`]:
        selected.contrastText ?? theme.palette.getContrastText(selected.main),
      ...extra?.(selected),
    },
  }));
}
