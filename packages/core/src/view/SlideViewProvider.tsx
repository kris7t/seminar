import { use, useEffect, type JSX, type ReactNode } from 'react';

import { SharedWorkContext } from '../shared/SharedWorkContext.ts';
import { StateScopeProvider } from '../state/SlideStateScope.tsx';
import { SlideViewContext, type SlideView } from './SlideViewContext.ts';

export interface SlideViewProviderProps {
  view: SlideView;
  children?: ReactNode;
}

/**
 * Renders a slide in a view. Should be remounted, e.g., with the index of the
 * slide as its `key`, when the view shows another slide.
 */
export function SlideViewProvider({
  view,
  children,
}: SlideViewProviderProps): JSX.Element {
  const sharedWork = use(SharedWorkContext);
  useEffect(
    () =>
      view.kind === 'probe' ? undefined : sharedWork?.mountSlide(view.index),
    [sharedWork, view.index, view.kind],
  );
  return (
    <SlideViewContext value={view}>
      <StateScopeProvider path="">{children}</StateScopeProvider>
    </SlideViewContext>
  );
}
