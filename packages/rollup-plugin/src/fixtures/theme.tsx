import { createSlideTheme, type SlideMasterProps } from '@seminar/core';
import type { JSX } from 'react';

declare module '@seminar/core' {
  interface StepBehaviorOverrides {
    ghost: true;
  }
}

function SectionMaster({ title }: SlideMasterProps): JSX.Element {
  return <h1 data-master="section">{title}</h1>;
}

export default createSlideTheme({
  master: { section: SectionMaster },
  stepBehaviors: { ghost: { future: 'dimmed', past: 'hidden' } },
});
