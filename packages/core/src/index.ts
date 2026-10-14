export type { MathConfig, SliderConfig } from './config/SliderConfig.ts';
export { Deck, type DeckProps } from './deck/Deck.tsx';
export { useDeck, type DeckState } from './deck/DeckContext.ts';
export { INTERACTIVE_ATTRIBUTE } from './interaction/interaction.ts';
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
  SectionMaster,
  sectionMasterClasses,
  type SectionMasterClassKey,
  type SectionMasterProps,
} from './masters/SectionMaster.tsx';
export {
  SubsectionMaster,
  subsectionMasterClasses,
  type SubsectionMasterClassKey,
  type SubsectionMasterProps,
} from './masters/SubsectionMaster.tsx';
export {
  TitleMaster,
  titleMasterClasses,
  type TitleMasterClassKey,
  type TitleMasterProps,
} from './masters/TitleMaster.tsx';
export {
  Formula,
  formulaClasses,
  type FormulaClassKey,
  type FormulaProps,
} from './formula/Formula.tsx';
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
