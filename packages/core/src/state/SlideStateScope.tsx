import { use, useEffect, useState, type JSX, type ReactNode } from 'react';

import { StateScope, StateScopeContext } from './StateScope.ts';

export interface SlideStateScopeProps {
  /** Distinguishes the scope from the other scopes of its parent scope. */
  id: string;
  children?: ReactNode;
}

/**
 * Gives the {@link useSlideState} calls of its children their own namespace,
 * e.g., in components that are rendered several times on a slide, or that
 * mount after the slide.
 */
export function SlideStateScope({
  id,
  children,
}: SlideStateScopeProps): JSX.Element {
  const parent = use(StateScopeContext);
  const path = `${parent?.path ?? ''}/${id}`;
  return <StateScopeProvider path={path}>{children}</StateScopeProvider>;
}

/**
 * Provides a new {@link StateScope}, e.g., for each view of a slide. Remount
 * it (by changing its `key`) to start a new scope.
 */
export function StateScopeProvider({
  path,
  children,
}: {
  path: string;
  children?: ReactNode;
}): JSX.Element {
  const [scope] = useState(() => new StateScope(path));
  // Effects of the children run first, so they have all mounted by now.
  useEffect(() => {
    scope.commit();
  }, [scope]);
  return <StateScopeContext value={scope}>{children}</StateScopeContext>;
}
