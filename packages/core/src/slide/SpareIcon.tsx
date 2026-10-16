import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import type { JSX } from 'react';

import { useT } from '../i18n/UiLanguageContext.ts';

import { SmallArchiveBoxIcon, type MarkIconProps } from './smallIcons.tsx';

/**
 * Marks a spare slide, which going through the deck skips, e.g., in the table
 * of contents and the overview. Labeled for assistive technology, and shows
 * its label as a tooltip.
 */
export function SpareIcon({
  small = false,
  ...props
}: MarkIconProps): JSX.Element {
  const t = useT();
  const Icon = small ? SmallArchiveBoxIcon : Inventory2OutlinedIcon;
  return <Icon fontSize="small" titleAccess={t('spareSlide')} {...props} />;
}
