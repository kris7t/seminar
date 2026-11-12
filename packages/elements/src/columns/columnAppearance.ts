import { createContext, type Context } from 'react';

import type { ElementColor } from '../paletteColors.ts';

/**
 * Keys of the MUI theme palette whose values are palette colors, like
 * `primary`, or text colors of the palette, like `text.secondary`.
 */
export type ColumnColor = ElementColor;

/** Further visual variants of columns, added by module augmentation. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Augmented by themes.
export interface ColumnVariantOverrides {}

/**
 * Visual treatment of a column: `plain`, with only its title in its color, or
 * `card`, with its title on a band of its color, over a faint background of
 * its color.
 */
export type ColumnVariant =
  | 'plain'
  | 'card'
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- Empty unless augmented.
  | keyof ColumnVariantOverrides;

/**
 * How a {@link Column} looks, which it takes from its {@link Columns} unless
 * it sets it itself.
 */
export interface ColumnAppearance {
  /**
   * MUI palette color of the column, like `primary`, or a text color, like
   * `text.secondary`. Defaults to `primary`.
   */
  color?: ColumnColor | undefined;
  /** Visual treatment of the column. Defaults to `plain`. */
  variant?: ColumnVariant | undefined;
  /**
   * Shadow depth of the column, from 0 to 24, which selects one of the
   * `shadows` of the MUI theme, like the `elevation` of a `Paper`. Defaults
   * to 0, without a shadow.
   */
  elevation?: number | undefined;
  /**
   * Corner radius of the column, in logical slide pixels. Defaults to twice
   * the theme shape radius.
   */
  radius?: number | undefined;
}

const COLUMN_APPEARANCE_KEYS = [
  'color',
  'variant',
  'elevation',
  'radius',
] as const satisfies (keyof ColumnAppearance)[];

/** Returns the appearance set in `props`, without the unset keys. */
export function columnAppearance(props: ColumnAppearance): ColumnAppearance {
  return Object.fromEntries(
    COLUMN_APPEARANCE_KEYS.flatMap((key) =>
      props[key] === undefined ? [] : [[key, props[key]]],
    ),
  );
}

/** The appearance of the columns of a {@link Columns}. */
export interface ColumnsAppearance {
  /** Set on the `Columns`, which overrides the theme of `Column`s. */
  props: ColumnAppearance;
  /** From the theme of `Columns`, which the theme of `Column`s overrides. */
  defaults: ColumnAppearance;
}

export const ColumnsAppearanceContext: Context<ColumnsAppearance | undefined> =
  createContext<ColumnsAppearance | undefined>(undefined);
