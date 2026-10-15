import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import type { SvgIconProps } from '@mui/material';
import type { JSX } from 'react';

/**
 * Marks a spare slide, which going through the deck skips, e.g., in the table
 * of contents and the overview. Labeled for assistive technology, and shows
 * its label as a tooltip.
 */
export function SpareIcon(props: SvgIconProps): JSX.Element {
  return (
    <Inventory2OutlinedIcon
      fontSize="small"
      titleAccess="Spare slide"
      {...props}
    />
  );
}
