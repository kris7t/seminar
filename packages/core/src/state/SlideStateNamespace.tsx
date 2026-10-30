import {
  use,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type JSX,
  type ReactNode,
} from 'react';

import { StateNamespace, StateNamespaceContext } from './StateNamespace.ts';

function NamespaceProvider({
  namespace,
  children,
}: {
  namespace: StateNamespace;
  children?: ReactNode;
}): JSX.Element {
  // Effects of the children run first, so they have all mounted by now.
  useEffect(() => {
    namespace.commit();
  }, [namespace]);
  return (
    <StateNamespaceContext value={namespace}>{children}</StateNamespaceContext>
  );
}

export interface SlideStateNamespaceProps {
  /** Distinguishes the namespace from the others in its parent. */
  id: string;
  children?: ReactNode;
}

/**
 * Gives the {@link useSlideState} calls of its children a namespace of their
 * own, e.g., to use a component with a fixed id several times on a slide.
 * Each namespace mounted at the same time needs a different `id`.
 */
export function SlideStateNamespace({
  id,
  children,
}: SlideStateNamespaceProps): JSX.Element {
  const parent = use(StateNamespaceContext);
  const namespace = useMemo(
    () => (parent ?? new StateNamespace()).child(id),
    [parent, id],
  );
  // Before the effects of the children, whose state clashes along with it.
  useLayoutEffect(
    () => namespace.claims.claimNamespace(namespace.path),
    [namespace],
  );
  return (
    <NamespaceProvider namespace={namespace}>{children}</NamespaceProvider>
  );
}

/**
 * Provides a new {@link StateNamespace}, e.g., for each view of a slide. Remount
 * it (by changing its `key`) to start a new namespace.
 */
export function StateNamespaceProvider({
  children,
}: {
  children?: ReactNode;
}): JSX.Element {
  const [namespace] = useState(() => new StateNamespace());
  return (
    <NamespaceProvider namespace={namespace}>{children}</NamespaceProvider>
  );
}
