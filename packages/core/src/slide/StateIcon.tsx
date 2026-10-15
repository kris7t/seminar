import DataObjectOutlinedIcon from '@mui/icons-material/DataObjectOutlined';
import { Badge, type SvgIconProps } from '@mui/material';
import type { JSX } from 'react';

export interface StateIconProps extends SvgIconProps {
  /** Whether the state of the slide was changed, which adds a dot. */
  changed: boolean;
}

/**
 * Marks a slide with state that it keeps when it is left, e.g., in the table
 * of contents and the overview, with a dot if the state was changed, like
 * unsaved changes. Labeled for assistive technology, and shows its label as a
 * tooltip.
 */
export function StateIcon({ changed, ...props }: StateIconProps): JSX.Element {
  const icon = (
    <DataObjectOutlinedIcon
      fontSize="small"
      titleAccess={changed ? 'Changed state' : 'Slide with state'}
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
