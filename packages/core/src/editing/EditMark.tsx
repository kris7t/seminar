import { useTheme } from '@mui/material/styles';
import { use, type JSX } from 'react';

import { EditingContext } from './EditingContext.ts';
import { EditLayer, useLegible } from './EditLayer.tsx';
import {
  anchorStyle,
  boxStyle,
  DiamondMark,
  BoxMark,
  isDark,
  MARK_ELEVATION,
  MarkAnchor,
} from './marks.tsx';
import type { Editable } from './useEditable.ts';

/** The shape of a mark around a point. */
export type EditMarkShape = 'square' | 'circle' | 'diamond';

/** Props of an {@link EditMark}. */
export interface EditMarkProps {
  /** The directive whose mark it is. */
  editable: Editable<object>;
  /** The middle of the mark, in the logical pixels of the slide. */
  at: { x: number; y: number };
  shape: EditMarkShape;
  /** Whether the mark lights up, e.g., while what it marks is hovered. */
  highlighted?: boolean | undefined;
}

/**
 * A mark of an editable directive in the {@link EditLayer}, which takes no
 * pointer, e.g., the corners of what dragging the directive moves. Like the
 * marks of a {@link DragHandle}, it shows while the directive is
 * {@link Editable.active}, and looks the same whatever the scale of the slide.
 */
export function EditMark({
  editable,
  at,
  shape,
  highlighted = false,
}: EditMarkProps): JSX.Element | null {
  const editing = use(EditingContext);
  const theme = useTheme();
  const legible = useLegible();
  if (editing === undefined || !legible) {
    return null;
  }
  const opacity = editable.active ? 1 : 0;
  const onDark = isDark(editing.background);
  return (
    <EditLayer>
      <MarkAnchor style={anchorStyle(editing, at.x, at.y)}>
        {shape === 'diamond' ? (
          <DiamondMark
            highlighted={highlighted}
            swapped={editable.swapped}
            onDark={onDark}
            elevation={MARK_ELEVATION}
            opacity={opacity}
          />
        ) : (
          <BoxMark
            shape={shape}
            highlighted={highlighted}
            swapped={editable.swapped}
            onDark={onDark}
            style={{
              ...boxStyle(shape, theme, onDark, MARK_ELEVATION),
              opacity,
            }}
          />
        )}
      </MarkAnchor>
    </EditLayer>
  );
}
