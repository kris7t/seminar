import { defineSlideStore, useStore } from '@seminar/core';
import type { JSX } from 'react';

const count = defineSlideStore<number>();

export function Count(): JSX.Element {
  const [value] = useStore(count);
  return <span>{value}</span>;
}
