import { createSlideTheme, type SlideMasterProps } from '@slider/core';
import type { JSX } from 'react';

declare module '@slider/core' {
  interface StepVariantOverrides {
    ghost: true;
  }
}

function SectionMaster({ title }: SlideMasterProps): JSX.Element {
  return <h1 data-master="section">{title}</h1>;
}

export default createSlideTheme({
  master: { section: SectionMaster },
  stepVariants: { ghost: { future: 'dimmed', past: 'hidden' } },
});
