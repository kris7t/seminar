import CodeIcon from '@mui/icons-material/Code';
import { Badge } from '@mui/material';
import type { JSX } from 'react';

import { SmallCodeIcon, type MarkIconProps } from './smallIcons.tsx';

export interface StateIconProps extends MarkIconProps {
  /** Whether the state of the slide was changed, which adds a dot. */
  changed: boolean;
}

/**
 * Marks a slide with state that it keeps when it is left, e.g., in the table
 * of contents and the overview, with a dot if the state was changed, like
 * unsaved changes. Labeled for assistive technology, and shows its label as a
 * tooltip.
 */
export function StateIcon({
  changed,
  small = false,
  ...props
}: StateIconProps): JSX.Element {
  const Icon = small ? SmallCodeIcon : CodeIcon;
  const icon = (
    <Icon
      fontSize="small"
      titleAccess={changed ? 'Changed' : 'Keeps your changes'}
      {...props}
    />
  );
  return changed ? (
    <Badge
      variant="dot"
      color="primary"
      sx={{
        fontSize: 'inherit',
        '& .MuiBadge-dot': { minWidth: '0.4em', height: '0.4em', p: 0 },
      }}
    >
      {icon}
    </Badge>
  ) : (
    icon
  );
}
