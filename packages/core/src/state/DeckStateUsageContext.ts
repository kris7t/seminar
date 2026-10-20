import { createContext, type Context } from 'react';

type RecordDeckStateUse = (slideIndex: number) => void;

/** Records which slides read deck state, including reads in probes and mirrors. */
export const DeckStateUsageContext: Context<RecordDeckStateUse | undefined> =
  createContext<RecordDeckStateUse | undefined>(undefined);
