import '@fontsource/roboto/400.css';

import {
  createSlideTheme,
  type SlideMasterProps,
  type SliderConfig,
} from '@slider/core';
import type { JSX } from 'react';

function SectionMaster({ title }: SlideMasterProps): JSX.Element {
  return <h1 data-master="section">{title}</h1>;
}

export default createSlideTheme({ master: { section: SectionMaster } });

export const slider: SliderConfig = { options: { math: { font: 'newcm' } } };
