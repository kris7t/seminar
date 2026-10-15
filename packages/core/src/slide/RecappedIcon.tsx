import UpdateIcon from '@mui/icons-material/Update';
import type { SvgIconProps } from '@mui/material';
import type { JSX } from 'react';

/**
 * Marks a slide that is recapped later in the deck, e.g., in the table of
 * contents and the overview. Labeled for assistive technology, and shows its
 * label as a tooltip.
 */
export function RecappedIcon(props: SvgIconProps): JSX.Element {
  return (
    <UpdateIcon fontSize="small" titleAccess="Recapped later" {...props} />
  );
}
