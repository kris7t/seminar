import { styled } from '@mui/material/styles';
import { use, type JSX } from 'react';

import { INTERACTIVE_ATTRIBUTE } from '../interaction/interaction.ts';
import { EditingContext } from './EditingContext.ts';
import { editableAt, EditLayer, scaleOf, useLegible } from './EditLayer.tsx';
import type { Editable } from './useEditable.ts';

/** Props of an {@link EditBridge}. */
export interface EditBridgeProps {
  /** The directive whose handles it leads to. */
  editable: Editable<object>;
  /**
   * The area of the bridge, as an SVG path in the logical pixels of the
   * slide, with holes where its subpaths overlap, e.g., where the directive
   * itself takes the pointer.
   */
  path: string;
  /** Where the origin of `path` is on the slide. Defaults to its origin. */
  at?: { x: number; y: number } | undefined;
}

const BridgeRoot = styled('svg', {
  name: 'SeminarEditBridge',
  slot: 'Root',
})({
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  overflow: 'visible',
  pointerEvents: 'none',
  fill: 'transparent',
  fillRule: 'evenodd',
});

/**
 * An invisible area of an editable directive in the {@link EditLayer}, which
 * keeps it hovered while the pointer crosses it, e.g., along the stem of a
 * callout to the handle at its tip, away from its body. Like a
 * {@link DragHandle}, it takes the pointer only while the directive shows its
 * handles.
 */
export function EditBridge({
  editable,
  path,
  at = { x: 0, y: 0 },
}: EditBridgeProps): JSX.Element | null {
  const editing = use(EditingContext);
  const legible = useLegible();
  if (editing === undefined || !legible) {
    return null;
  }
  return (
    <EditLayer>
      <BridgeRoot aria-hidden>
        <path
          d={path}
          transform={`scale(${String(scaleOf(editing))}) translate(${String(at.x)} ${String(at.y)})`}
          {...{ [INTERACTIVE_ATTRIBUTE]: '' }}
          style={{ pointerEvents: editable.active ? 'fill' : 'none' }}
          onPointerEnter={() => {
            editing.hover(editable.key);
          }}
          onPointerLeave={(event) => {
            editing.hover(editableAt(event.relatedTarget));
          }}
        />
      </BridgeRoot>
    </EditLayer>
  );
}
