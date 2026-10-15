import HistoryIcon from '@mui/icons-material/History';
import type { SvgIconProps } from '@mui/material';
import type { JSX } from 'react';

/**
 * Marks a recap of a slide, e.g., in the table of contents and the overview,
 * mirroring the {@link RecappedIcon} of the recapped slide.
 * Labeled for assistive technology, and shows its label as a tooltip.
 */
export function RecapIcon(props: SvgIconProps): JSX.Element {
  return <HistoryIcon fontSize="small" titleAccess="Recap" {...props} />;
}
