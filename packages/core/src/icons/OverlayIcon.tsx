import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined';
import type { SvgIconProps } from '@mui/material';
import type { JSX } from 'react';

import { useT } from '../i18n/UiLanguageContext.ts';

/**
 * Marks a step that may cover other content, e.g., a callout, in the tree of
 * steps. Labeled for assistive technology, and shows its label as a tooltip.
 */
export function OverlayIcon(props: SvgIconProps): JSX.Element {
  const t = useT();
  return (
    <LayersOutlinedIcon
      fontSize="small"
      titleAccess={t('overlayStep')}
      {...props}
    />
  );
}
