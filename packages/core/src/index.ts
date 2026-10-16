export type {
  DirectiveComponentConfig,
  DirectiveForm,
  MathConfig,
  SliderConfig,
} from './config/SliderConfig.ts';
export { Deck, type DeckProps } from './deck/Deck.tsx';
export { useDeck, type DeckState } from './deck/DeckContext.ts';
export type { GoToSteps } from './deck/useDeckNavigation.ts';
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
export { Notes, type NotesProps } from './notes/Notes.tsx';
export { Slide, type SlideProps } from './slide/Slide.tsx';
export {
  parseSlidePoint,
  resolveSlidePoint,
  SLIDE_BOX,
  useSlideBox,
  useSlidePoint,
  type SlideBox,
  type SlideCoordinate,
  type SlidePoint,
  type SlidePointOptions,
  type SlidePointPosition,
} from './slide/slideBoxes.ts';
export {
  SlideElement,
  useSlideElement,
  useSlideElementId,
  useSlideElementRef,
  type SlideElementProps,
  type SlideElementReference,
} from './slide/SlideElements.tsx';
export {
  SlideStateScope,
  type SlideStateScopeProps,
} from './state/SlideStateScope.tsx';
export {
  useResetSlideState,
  useSlideState,
  type SlideStateOptions,
} from './state/useSlideState.ts';
export {
  SLIDE_VIEW_ATTRIBUTE,
  useSlideView,
  type SlideView,
  type SlideViewKind,
  type SlideViewState,
} from './slide/SlideViewContext.ts';
export {
  getStepTransition,
  useOwnAnimation,
  type StepTransition,
} from './slide/SlideTransitions.ts';
export {
  SlideNumber,
  slideNumberClasses,
  type SlideNumberClassKey,
  type SlideNumberProps,
} from './slide/SlideNumber.tsx';
export {
  Step,
  stepClasses,
  WITH_INITIAL,
  WITH_PREVIOUS,
  type StepClassKey,
  type StepAttachment,
  type StepProps,
  type StepBehavior,
  type StepBehaviorOverrides,
  type StepBehaviorShorthands,
} from './steps/Step.tsx';
export {
  Image,
  imageClasses,
  type ImageClassKey,
  type ImageProps,
} from './content/Image.tsx';
export { ListItem, type ListItemProps } from './content/ListItem.tsx';
export { Paragraph, type ParagraphProps } from './content/Paragraph.tsx';
export { Together, type TogetherProps } from './steps/Together.tsx';
export {
  Steps,
  stepsClasses,
  type StepsClassKey,
  type StepsProps,
} from './steps/Steps.tsx';
export type { StepPath, StepPhase } from './steps/StepStore.ts';
export type { StepRange } from './steps/stepRange.ts';
export {
  BUILT_IN_APPEARANCE_RANKS,
  BUILT_IN_STEP_BEHAVIORS,
  type BuiltInStepBehavior,
  type StepAppearance,
  type StepAppearanceOverrides,
  type StepAppearances,
} from './steps/stepAppearance.ts';
export {
  useStep,
  useSteps,
  type StepHandle,
  type StepState,
  type StepWith,
  type UseStepsOptions,
} from './steps/useSteps.ts';
export type { ComponentTheme } from './theme/ComponentTheme.ts';
export type { TocEntry } from './toc/tableOfContents.ts';
export {
  createSlideTheme,
  defaultSlideTheme,
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
} from './theme/createSlideTheme.ts';
export { default as FRENCH } from './i18n/locales/fr.ts';
export { default as GERMAN } from './i18n/locales/de.ts';
export { default as HUNGARIAN } from './i18n/locales/hu.ts';
export {
  ENGLISH,
  type MessageKey,
  type MessageValues,
  type Translate,
  type UiCatalog,
  type UiLocale,
} from './i18n/messages.ts';
export {
  useT,
  useUiLanguage,
  type UiLanguage,
} from './i18n/UiLanguageContext.ts';
