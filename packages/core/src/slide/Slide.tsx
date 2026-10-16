import { useTheme } from '@mui/material';
import {
  createElement,
  use,
  useLayoutEffect,
  type JSX,
  type ReactNode,
} from 'react';

import { DeckContext } from '../deck/DeckContext.ts';
import type { SlideMaster, SlideMasters } from '../masters/SlideMaster.ts';
import type { StepBehavior } from '../steps/Step.tsx';
import { StepStoreContext } from '../steps/StepStoreContext.ts';
import { StepBehaviorContext } from '../steps/StepBehaviorContext.ts';
import { SlideViewContext, useSlideView } from './SlideViewContext.ts';

export interface SlideProps {
  /**
   * Identifier of the slide shown in the location hash.
   *
   * Slides without an id are identified by `slide=<n>`.
   */
  id?: string | undefined;
  /**
   * Further ids that refer to the slide in the location hash, e.g., of a
   * division of the deck without a slide of its own, whose first slide this
   * is. The location hash shows the `id` of the slide instead.
   */
  aliases?: readonly string[] | undefined;
  /**
   * The master that lays out the slide: either the name of a master in
   * `theme.master` or a master component. Defaults to `'content'`.
   */
  master?: string | SlideMaster;
  /** Title of the slide passed to the master. */
  title?: ReactNode;
  /** Classes of the slide passed to the master. */
  className?: string | undefined;
  /** Behavior of the steps on the slide that don't set their own. */
  steps?: StepBehavior | undefined;
  /**
   * The first step to show when going through the slide, e.g., `2`, `1.1`, or
   * the name of a step group (see `StepRange`).
   */
  from?: string | undefined;
  /** The step after which to start showing steps (see `StepRange`). */
  after?: string | undefined;
  /** The last step to show (see `StepRange`). */
  to?: string | undefined;
  /** The step before which to stop showing steps (see `StepRange`). */
  before?: string | undefined;
  /**
   * Whether the slide is spare, e.g., a backup slide for questions. Going
   * through the {@link Deck} skips spare slides, but they can be chosen,
   * e.g., in the table of contents or the overview, and going forward or
   * back from a spare slide shows the adjacent slides.
   */
  spare?: boolean | undefined;
  /**
   * Id of the slide to recap. A {@link Deck} shows the recapped slide instead,
   * with its own step position, `id`, `spare`, and range of steps, but sharing
   * the rest of the state of the slide. Without `from` or `after`, the recap
   * continues where the previous showing of the slide ended, or only shows the
   * last step if it showed all of them.
   */
  recap?: string | undefined;
  /**
   * Whether to only show the last step when going through the slide, e.g.,
   * for a recap of a slide whose steps have all been shown.
   */
  fromLast?: boolean | undefined;
  /**
   * Index of the slide that this slide recaps, whose state it shares, set by
   * the {@link Deck}.
   */
  recapOf?: number | undefined;
  /**
   * The language of the slide, as a BCP 47 tag, if it differs from the
   * language of the deck, e.g., for a slide included from a deck in another
   * language.
   */
  lang?: string | undefined;
  children?: ReactNode;
}

function resolveMaster(
  master: string | SlideMaster,
  masters: SlideMasters,
): SlideMaster {
  if (typeof master !== 'string') {
    return master;
  }
  const resolved = masters[master];
  if (resolved === undefined) {
    throw new Error(`Unknown slide master: ${master}`);
  }
  return resolved;
}

/** A single slide of a {@link Deck}. */
export function Slide({
  master: masterName = 'content',
  title,
  className,
  steps,
  from,
  after,
  to,
  before,
  fromLast,
  recapOf,
  lang,
  children,
}: SlideProps): JSX.Element {
  const theme = useTheme();
  const view = useSlideView();
  // Before painting, so that the slide doesn't show a step outside the range.
  const store = use(StepStoreContext);
  useLayoutEffect(() => {
    store.setRange(
      from === undefined &&
        after === undefined &&
        to === undefined &&
        before === undefined &&
        fromLast !== true
        ? undefined
        : { from, after, to, before, fromLast },
    );
    return () => {
      store.setRange(undefined);
    };
  }, [store, from, after, to, before, fromLast]);
  // Every view of the slide tells its language, e.g., for reading it out,
  // even in the user interface, which may be in another language.
  const slideLang = lang ?? use(DeckContext)?.lang;
  // Masters are looked up rather than defined during render, so their state is
  // preserved. Use `createElement` to avoid tripping `static-components`.
  const master = createElement(
    resolveMaster(masterName, theme.master),
    { title, className },
    children,
  );
  const content = (
    <StepBehaviorContext value={steps}>
      {slideLang === undefined ? (
        master
      ) : (
        // Without a box of its own, so that the master is laid out as before.
        <div lang={slideLang} style={{ display: 'contents' }}>
          {master}
        </div>
      )}
    </StepBehaviorContext>
  );
  // Recaps share the state of the slide they recap.
  return recapOf === undefined ? (
    content
  ) : (
    <SlideViewContext value={{ ...view, stateIndex: recapOf }}>
      {content}
    </SlideViewContext>
  );
}
