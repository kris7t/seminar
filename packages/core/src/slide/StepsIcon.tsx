import AutoAwesomeMotionOutlinedIcon from '@mui/icons-material/AutoAwesomeMotionOutlined';
import type { SvgIconProps } from '@mui/material';
import type { JSX } from 'react';

/**
 * Marks a slide with steps, e.g., in the table of contents and the overview,
 * like the steps in the sidebar, but outlined to be lighter. Labeled for
 * assistive technology, and shows its label as a tooltip.
 */
export function StepsIcon(props: SvgIconProps): JSX.Element {
  return (
    <AutoAwesomeMotionOutlinedIcon
      fontSize="small"
      titleAccess="Slide with steps"
      {...props}
    />
  );
}
