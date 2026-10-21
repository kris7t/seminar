import { createContext, type Context } from 'react';

type RecordDeckStateUse = (slideIndex: number, key: string) => void;

/** Records which slides read deck state, including reads in probes and mirrors. */
export const DeckStateUsageContext: Context<RecordDeckStateUse | undefined> =
  createContext<RecordDeckStateUse | undefined>(undefined);

/** Records which slides share persistent slide state, including recaps. */
export const SlideStateUsageContext: Context<
  ((slideIndex: number, stateIndex: number) => void) | undefined
> = createContext<
  ((slideIndex: number, stateIndex: number) => void) | undefined
>(undefined);
