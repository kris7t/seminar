import { use, useMemo, type JSX, type ReactNode } from 'react';

import type { SlideView } from '../slide/SlideViewContext.ts';
import { SlideViewProvider } from '../slide/SlideViewProvider.tsx';
import { SlideStateContext } from '../state/SlideStateContext.ts';
import { StepStore } from '../steps/StepStore.ts';
import { StepStoreContext } from '../steps/StepStoreContext.ts';

export interface SlidePreviewProps {
  index: number;
  slide: ReactNode;
}

/**
 * Renders the next or previous slide in a `'preview'` view while swiping, with
 * the steps last shown on it.
 */
export function SlidePreview({ index, slide }: SlidePreviewProps): JSX.Element {
  const view = useMemo<SlideView>(
    () => ({ index, kind: 'preview', interactive: false }),
    [index],
  );
  const slideState = use(SlideStateContext);
  const stepStore = useMemo(
    () => new StepStore({ position: slideState.stepPosition(index) }),
    [slideState, index],
  );
  return (
    <StepStoreContext value={stepStore}>
      <SlideViewProvider view={view}>{slide}</SlideViewProvider>
    </StepStoreContext>
  );
}
