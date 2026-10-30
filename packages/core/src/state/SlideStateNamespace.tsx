import {
  use,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type JSX,
  type ReactNode,
} from 'react';

import { StateScope, StateScopeContext } from './StateScope.ts';

function ScopeProvider({
  scope,
  children,
}: {
  scope: StateScope;
  children?: ReactNode;
}): JSX.Element {
  // Effects of the children run first, so they have all mounted by now.
  useEffect(() => {
    scope.commit();
  }, [scope]);
  return <StateScopeContext value={scope}>{children}</StateScopeContext>;
}

export interface SlideStateNamespaceProps {
  /** Distinguishes the namespace from the others in its parent. */
  id: string;
  children?: ReactNode;
}

/**
 * Gives the {@link useSlideState} calls of its children a namespace of their
 * own, e.g., to use a component with a fixed key several times on a slide.
 * Each namespace mounted at the same time needs a different `id`.
 */
export function SlideStateNamespace({
  id,
  children,
}: SlideStateNamespaceProps): JSX.Element {
  const parent = use(StateScopeContext);
  const scope = useMemo(
    () => (parent ?? new StateScope()).child(id),
    [parent, id],
  );
  // Before the effects of the children, whose state clashes along with it.
  useLayoutEffect(() => scope.claims.claimNamespace(scope.path), [scope]);
  return <ScopeProvider scope={scope}>{children}</ScopeProvider>;
}

/**
 * Provides a new {@link StateScope}, e.g., for each view of a slide. Remount
 * it (by changing its `key`) to start a new scope.
 */
export function StateScopeProvider({
  children,
}: {
  children?: ReactNode;
}): JSX.Element {
  const [scope] = useState(() => new StateScope());
  return <ScopeProvider scope={scope}>{children}</ScopeProvider>;
}
