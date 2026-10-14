export { Deck, type DeckProps } from './deck/Deck.tsx';
export { useDeck, type DeckState } from './deck/DeckContext.ts';
export type {
  SlideMaster,
  SlideMasterProps,
  SlideMasters,
} from './masters/SlideMaster.ts';
export {
  ContentMaster,
  contentMasterClasses,
  type ContentMasterClassKey,
  type ContentMasterProps,
} from './masters/ContentMaster.tsx';
export {
  TitleMaster,
  titleMasterClasses,
  type TitleMasterClassKey,
  type TitleMasterProps,
} from './masters/TitleMaster.tsx';
export { Slide, type SlideProps } from './slide/Slide.tsx';
export {
  SlideNumber,
  slideNumberClasses,
  type SlideNumberClassKey,
  type SlideNumberProps,
} from './slide/SlideNumber.tsx';
export {
  Step,
  stepClasses,
  type StepClassKey,
  type StepProps,
} from './steps/Step.tsx';
export { Together, type TogetherProps } from './steps/Together.tsx';
export {
  Steps,
  stepsClasses,
  type StepsClassKey,
  type StepsProps,
} from './steps/Steps.tsx';
export type { StepPath } from './steps/StepStore.ts';
export {
  useStep,
  useSteps,
  type StepHandle,
  type StepState,
  type StepWith,
  type UseStepsOptions,
} from './steps/useSteps.ts';
export type { ComponentTheme } from './theme/ComponentTheme.ts';
export {
  createSlideTheme,
  defaultSlideTheme,
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
} from './theme/createSlideTheme.ts';
