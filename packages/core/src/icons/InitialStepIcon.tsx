import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import type { SvgIconProps } from '@mui/material';
import type { JSX } from 'react';

import { useT } from '../i18n/UiLanguageContext.ts';

/**
 * Marks an initial step in the tree of steps, which is shown as soon as the step
 * around it. Labeled for assistive technology, and shows its label as a tooltip.
 */
export function InitialStepIcon(props: SvgIconProps): JSX.Element {
  const t = useT();
  return (
    <PushPinOutlinedIcon
      fontSize="small"
      titleAccess={t('initialStep')}
      {...props}
    />
  );
}
