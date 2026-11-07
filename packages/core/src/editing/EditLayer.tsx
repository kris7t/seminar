import { useTheme } from '@mui/material/styles';
import { use, type ReactNode, type ReactPortal } from 'react';
import { createPortal } from 'react-dom';

import { findPropsOf } from '../host/sourceRanges.ts';
import { rankOf, useStepAppearance } from '../steps/stepAppearance.ts';
import { EditingContext, type Editing } from './EditingContext.ts';
import { editableKeyOf } from './useEditable.ts';

/**
 * Renders `children` in the layer above the slide while it's edited, e.g.,
 * the handles of an editable directive. The layer isn't scaled with the
 * slide, so that what is in it is drawn in whole screen pixels: a logical
 * pixel of the slide is {@link useSlideScale} pixels of the layer. What is in
 * it takes no room on the slide, and gets none of the styles of the steps
 * around it. Renders nothing while the slide isn't edited.
 */
export function EditLayer({
  children,
}: {
  children?: ReactNode;
}): ReactPortal | null {
  const layer = use(EditingContext)?.layer;
  return layer === null || layer === undefined
    ? null
    : createPortal(children, layer);
}

/** The screen pixels of a logical pixel of the slide being edited. */
export function useSlideScale(): number {
  return use(EditingContext)?.scale ?? 1;
}

/** How far a handle is dragged, in the logical pixels of the slide. */
export interface Drag {
  dx: number;
  dy: number;
  /** Whether Shift is held, e.g., to edit more finely. */
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

/**
 * Whether what is around the component being rendered can be read, as the
 * `legibleStepAppearance` of the theme tells, which is all that is edited.
 */
export function useLegible(): boolean {
  const theme = useTheme();
  return (
    useStepAppearance().rank <=
    rankOf(theme, theme.legibleStepAppearance ?? 'dimmed')
  );
}

/** Returns the scale of the slide, which isn't known before it's laid out. */
export function scaleOf(editing: Editing | undefined): number {
  return editing !== undefined && editing.scale > 0 ? editing.scale : 1;
}

/** Returns the key of the innermost editable directive around `target`. */
export function editableAt(target: EventTarget | null): string | undefined {
  return target instanceof Element
    ? findPropsOf(target, editableKeyOf)
    : undefined;
}
