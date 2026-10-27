import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import type { SvgIconProps } from '@mui/material';
import type { JSX } from 'react';

import { useT } from '../i18n/UiLanguageContext.ts';

/**
 * Marks a step that becomes a page when its slide is split into pages, e.g.,
 * in the tree of steps. Labeled for assistive technology, and shows its label
 * as a tooltip.
 */
export function SplitPageIcon(props: SvgIconProps): JSX.Element {
  const t = useT();
  return (
    <InsertDriveFileOutlinedIcon
      fontSize="small"
      titleAccess={t('splitPage')}
      {...props}
    />
  );
}
