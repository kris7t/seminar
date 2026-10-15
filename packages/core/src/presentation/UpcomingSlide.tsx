import {
  use,
  useLayoutEffect,
  useMemo,
  useState,
  type JSX,
  type ReactNode,
} from 'react';

import type { SlideView } from '../slide/SlideViewContext.ts';
import { SlideViewProvider } from '../slide/SlideViewProvider.tsx';
import { StepStore } from '../steps/StepStore.ts';
import { StepStoreContext } from '../steps/StepStoreContext.ts';

export interface UpcomingSlideProps {
  index: number;
  slide: ReactNode;
  /**
   * Whether to show the next step of the current slide, or the beginning of
   * the slide.
   */
  nextStep: boolean;
}

/**
 * Renders what the next step will show in a `'preview'` view: the current
 * slide with its next step, or the beginning of the next slide.
 *
 * The steps of the preview are its own, so it doesn't change the steps of the
 * slide in other views.
 */
export function UpcomingSlide({
  index,
  slide,
  nextStep,
}: UpcomingSlideProps): JSX.Element {
  const view = useMemo<SlideView>(
    () => ({ index, kind: 'preview', interactive: false }),
    [index],
  );
  const currentSteps = use(StepStoreContext);
  const [stepStore] = useState(() => new StepStore());
  // Follow the current slide one step ahead. The steps of the preview are
  // known by now, since effects of children run first.
  useLayoutEffect(() => {
    if (!nextStep) {
      return undefined;
    }
    const update = () => {
      stepStore.reset(currentSteps.getPath());
      stepStore.next();
    };
    update();
    return currentSteps.subscribe(update);
  }, [nextStep, currentSteps, stepStore]);
  return (
    <StepStoreContext value={stepStore}>
      <SlideViewProvider view={view}>{slide}</SlideViewProvider>
    </StepStoreContext>
  );
}
