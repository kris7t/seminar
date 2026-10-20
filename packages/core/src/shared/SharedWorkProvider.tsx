import { useEffect, useState, type JSX, type ReactNode } from 'react';

import { SharedWorkContext } from './SharedWorkContext.ts';
import { SharedWorkStore } from './SharedWorkStore.ts';

/** Owns lazy resources and cached work for the lifetime of a Deck. */
export function SharedWorkProvider({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const [store] = useState(() => new SharedWorkStore());
  useEffect(() => store.mount(), [store]);
  return <SharedWorkContext value={store}>{children}</SharedWorkContext>;
}
