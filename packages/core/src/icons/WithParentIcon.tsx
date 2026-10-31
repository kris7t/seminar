import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import type { SvgIconProps } from '@mui/material';
import type { JSX } from 'react';

import { useT } from '../i18n/UiLanguageContext.ts';

/**
 * Marks a step that is always shown along with the step around it in the tree
 * of steps. Labeled for assistive technology, and shows its label as a tooltip.
 */
export function WithParentIcon(props: SvgIconProps): JSX.Element {
  const t = useT();
  return (
    <PushPinOutlinedIcon
      fontSize="small"
      titleAccess={t('withParentStep')}
      {...props}
    />
  );
}
