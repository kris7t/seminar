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
  createSlideTheme,
  defaultSlideTheme,
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
} from './theme/createSlideTheme.ts';
