import SubdirectoryArrowLeftIcon from '@mui/icons-material/SubdirectoryArrowLeft';
import type { JSX } from 'react';

import { useT } from '../i18n/UiLanguageContext.ts';

import { SmallRecapIcon, type MarkIconProps } from './smallIcons.tsx';

/**
 * Marks a recap of a slide, e.g., in the table of contents and the overview,
 * with an arrow back to the recapped slide, mirroring the
 * {@link RecappedIcon} of the recapped slide. Labeled for assistive
 * technology, and shows its label as a tooltip.
 */
export function RecapIcon({
  small = false,
  ...props
}: MarkIconProps): JSX.Element {
  const t = useT();
  const Icon = small ? SmallRecapIcon : SubdirectoryArrowLeftIcon;
  return <Icon fontSize="small" titleAccess={t('recap')} {...props} />;
}
