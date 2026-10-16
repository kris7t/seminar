import type { JSX, ReactNode } from 'react';

export function Callout({ children }: { children?: ReactNode }): JSX.Element {
  return <aside data-plugin="callout">{children}</aside>;
}
