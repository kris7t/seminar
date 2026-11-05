import type { AttributeChanges } from '@seminar/core';

/** A column next to the divider being dragged, as it was when the drag began. */
export interface ResizedColumn {
  /** Measured width in logical slide pixels. */
  width: number;
  /** The `width` prop of the column, if it has one. */
  fixed: number | string | undefined;
  /** The `grow` prop of the column, if it has one. */
  grow: number | undefined;
}

/** Narrowest a column gets while resizing, in logical slide pixels. */
export const MIN_COLUMN_WIDTH = 24;

/** Steps of `grow`, and of them while resizing finely. */
const GROW_STEP = 0.1;
const FINE_GROW_STEP = 0.01;

const PERCENTAGE = /^\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)\s*%\s*$/;

function round(value: number, step: number): number {
  // Without the errors of floating point, e.g., 0.30000000000000004.
  return Number((Math.round(value / step) * step).toFixed(4));
}

/** Returns `width` in the unit of `previous`: a percentage of `row`, or pixels. */
function widthLike(
  previous: number | string,
  width: number,
  row: number,
  fine: boolean,
): number | string {
  return typeof previous === 'string' && PERCENTAGE.test(previous) && row > 0
    ? `${String(round((width / row) * 100, fine ? 0.1 : 1))}%`
    : round(width, 1);
}

/**
 * Returns the changes of the attributes of the columns on the left and the
 * right of a divider dragged by `dx`, so that only these two change, and
 * share the width they had: columns with a width get another width, in its
 * unit, and columns that grow share their growth in another ratio. A `grow`
 * of 1, the default, is removed.
 *
 * @param row The width of the row, which percentages are of.
 * @param fine Whether to change by smaller steps, e.g., with Shift.
 */
export function resizeColumns(
  left: ResizedColumn,
  right: ResizedColumn,
  dx: number,
  row: number,
  fine = false,
): [AttributeChanges, AttributeChanges] {
  const total = left.width + right.width;
  if (total <= 0) {
    return [{}, {}];
  }
  const leftWidth = Math.min(
    Math.max(left.width + dx, MIN_COLUMN_WIDTH),
    Math.max(total - MIN_COLUMN_WIDTH, MIN_COLUMN_WIDTH),
  );
  const rightWidth = total - leftWidth;
  if (left.fixed !== undefined || right.fixed !== undefined) {
    return [
      left.fixed === undefined
        ? {}
        : { width: widthLike(left.fixed, leftWidth, row, fine) },
      right.fixed === undefined
        ? {}
        : { width: widthLike(right.fixed, rightWidth, row, fine) },
    ];
  }
  const step = fine ? FINE_GROW_STEP : GROW_STEP;
  const growth = (left.grow ?? 1) + (right.grow ?? 1);
  const leftGrow = Math.min(
    Math.max(round((growth * leftWidth) / total, step), step),
    round(growth - step, step),
  );
  const rightGrow = round(growth - leftGrow, step / 100);
  return [
    { grow: leftGrow === 1 ? null : leftGrow },
    { grow: rightGrow === 1 ? null : rightGrow },
  ];
}
