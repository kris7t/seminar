import AutoAwesomeMotionOutlinedIcon from '@mui/icons-material/AutoAwesomeMotionOutlined';
import type { JSX } from 'react';

import { useT } from '../i18n/UiLanguageContext.ts';

import { SmallStepsIcon, type MarkIconProps } from './smallIcons.tsx';

/**
 * Marks a slide with steps, e.g., in the table of contents and the overview,
 * like the steps in the sidebar, but outlined to be lighter. Labeled for
 * assistive technology, and shows its label as a tooltip.
 */
export function StepsIcon({
  small = false,
  ...props
}: MarkIconProps): JSX.Element {
  const t = useT();
  const Icon = small ? SmallStepsIcon : AutoAwesomeMotionOutlinedIcon;
  return <Icon fontSize="small" titleAccess={t('slideWithSteps')} {...props} />;
}
