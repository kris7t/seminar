import SubdirectoryArrowRightIcon from '@mui/icons-material/SubdirectoryArrowRight';
import type { JSX } from 'react';

import { SmallRecappedIcon, type MarkIconProps } from './smallIcons.tsx';

/**
 * Marks a slide that is recapped later in the deck, e.g., in the table of
 * contents and the overview, with an arrow on to its recaps. Labeled for
 * assistive technology, and shows its label as a tooltip.
 */
export function RecappedIcon({
  small = false,
  ...props
}: MarkIconProps): JSX.Element {
  const Icon = small ? SmallRecappedIcon : SubdirectoryArrowRightIcon;
  return <Icon fontSize="small" titleAccess="Recapped later" {...props} />;
}
