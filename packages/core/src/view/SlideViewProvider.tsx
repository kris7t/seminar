import { use, useEffect, type JSX, type ReactNode } from 'react';

import { SharedWorkContext } from '../shared/SharedWorkContext.ts';
import { StateScopeProvider } from '../state/SlideStateNamespace.tsx';
import { SlideErrorBoundary } from './SlideErrorBoundary.tsx';
import {
  SlideViewContext,
  type SlideView,
  type SlideViewKind,
} from './SlideViewContext.ts';

/**
 * The views that people look at. Other views leave out a slide that fails to
 * render, or let the code that renders them handle the error.
 */
const SHOWN_KINDS: ReadonlySet<SlideViewKind> = new Set([
  'audience',
  'presenter',
  'preview',
]);

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
      {SHOWN_KINDS.has(view.kind) ? (
        <SlideErrorBoundary>
          <StateScopeProvider>{children}</StateScopeProvider>
        </SlideErrorBoundary>
      ) : (
        <StateScopeProvider>{children}</StateScopeProvider>
      )}
    </SlideViewContext>
  );
}
