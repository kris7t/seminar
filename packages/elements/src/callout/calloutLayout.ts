import type { SlideBox } from '@seminar/core';
import { createContext, use, type Context } from 'react';

import type {
  CalloutGeometry,
  CalloutGeometryOptions,
} from './calloutGeometry.ts';

/** Where a callout is on its slide, see {@link useCalloutLayout}. */
export interface CalloutLayout {
  /**
   * What the geometry is computed from, with the point that the callout
   * points at, moved by its `shift`, in logical slide pixels.
   */
  options: CalloutGeometryOptions;
  /** The geometry, relative to the point that the callout points at. */
  geometry: CalloutGeometry;
  /** The box that `at` is in: of the anchor, or of the slide without one. */
  box: SlideBox;
  /** The element of the body. */
  body: HTMLElement | null;
}

export const CalloutLayoutContext: Context<CalloutLayout | undefined> =
  createContext<CalloutLayout | undefined>(undefined);

/**
 * Returns where the callout around the component being rendered is on its
 * slide, once it's measured, e.g., to draw something on its stem.
 */
export function useCalloutLayout(): CalloutLayout | undefined {
  return use(CalloutLayoutContext);
}
