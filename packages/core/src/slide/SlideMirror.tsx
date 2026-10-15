import { use, useMemo, type JSX, type ReactNode } from 'react';

import { SlideStateContext } from '../state/SlideStateContext.ts';
import { StepStore } from '../steps/StepStore.ts';
import { StepStoreContext } from '../steps/StepStoreContext.ts';
import type { SlideView, SlideViewKind } from './SlideViewContext.ts';
import { SlideViewProvider } from './SlideViewProvider.tsx';

export interface SlideMirrorProps {
  index: number;
  slide: ReactNode;
  kind: SlideViewKind;
}

/**
 * Renders a slide in another, non-interactive view next to the one the
 * presenter interacts with, showing the steps last shown on the slide.
 */
export function SlideMirror({
  index,
  slide,
  kind,
}: SlideMirrorProps): JSX.Element {
  const view = useMemo<SlideView>(
    () => ({ index, kind, interactive: false }),
    [index, kind],
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
