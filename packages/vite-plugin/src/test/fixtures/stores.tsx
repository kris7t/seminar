import { defineStore, useStore } from '@seminar/core';
import type { JSX } from 'react';

const count = defineStore<number>();

export function Count(): JSX.Element {
  const [value] = useStore(count);
  return <span>{value}</span>;
}
