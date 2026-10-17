import { createSvgIcon, type SvgIcon, type SvgIconProps } from '@mui/material';

/** Props of the icons that mark slides, which have small variants. */
export interface MarkIconProps extends SvgIconProps {
  /**
   * Whether the icon is drawn at half its size, i.e., 12 pixels, e.g., in the
   * overview, where a simplified variant stays sharp.
   */
  small?: boolean | undefined;
}

/**
 * Creates an icon from pixel art on a 12 by 12 grid, with `#` for the drawn
 * pixels, so that it is sharp at 12 pixels, at half the size of the 24 by 24
 * grid of the icons of Material Design.
 */
function createPixelIcon(
  rows: readonly string[],
  name: string,
): typeof SvgIcon {
  const path = rows
    .flatMap((row, y) =>
      [...row.matchAll(/#+/gu)].map(
        ({ index, 0: run }) =>
          `M${String(index * 2)} ${String(y * 2)}h${String(run.length * 2)}v2h${String(-run.length * 2)}z`,
      ),
    )
    .join('');
  return createSvgIcon(<path d={path} />, name);
}

/** Like `AutoAwesomeMotionOutlined`. */
export const SmallStepsIcon: typeof SvgIcon = createPixelIcon(
  [
    '............',
    '.######.....',
    '.#..........',
    '.#.######...',
    '.#.#........',
    '.#.#.######.',
    '.#.#.#....#.',
    '...#.#....#.',
    '...#.#....#.',
    '.....#....#.',
    '.....######.',
    '............',
  ],
  'SmallSteps',
);

/**
 * Like `SubdirectoryArrowLeft`, with a bigger head, with flat ends on whole
 * pixels, leaving more room below and to the right of it than above and to the
 * left.
 */
export const SmallRecapIcon: typeof SvgIcon = createSvgIcon(
  <path d="M18 2h2v12H4v-2h14zM2 13l7-7h3l-7 7 7 7H9z" />,
  'SmallRecap',
);

/** Like `SubdirectoryArrowRight`, and the mirror image of the recap icon. */
export const SmallRecappedIcon: typeof SvgIcon = createSvgIcon(
  <path d="M2 2h2v10h14v2H2zm18 11-7-7h-3l7 7-7 7h3z" />,
  'SmallRecapped',
);

/**
 * Like `Code`, but 7 pixels tall and 11 wide, with flat ends on whole pixels,
 * leaving more room below and to the right of it than above and to the left.
 */
export const SmallCodeIcon: typeof SvgIcon = createSvgIcon(
  <path d="M7 4h3l-7 7 7 7H7l-7-7zm5 0h3l7 7-7 7h-3l7-7z" />,
  'SmallCode',
);

/** Like `Inventory2Outlined`. */
export const SmallArchiveBoxIcon: typeof SvgIcon = createPixelIcon(
  [
    '............',
    '.##########.',
    '.#........#.',
    '.##########.',
    '..#......#..',
    '..#......#..',
    '..#.####.#..',
    '..#......#..',
    '..#......#..',
    '..#......#..',
    '..########..',
    '............',
  ],
  'SmallArchiveBox',
);
