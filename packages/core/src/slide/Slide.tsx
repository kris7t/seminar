import { useTheme } from '@mui/material';
import {
  createElement,
  use,
  useLayoutEffect,
  type JSX,
  type ReactNode,
} from 'react';

import type { SlideMaster, SlideMasters } from '../masters/SlideMaster.ts';
import type { StepVariant } from '../steps/Step.tsx';
import { StepStoreContext } from '../steps/StepStoreContext.ts';
import { StepVariantContext } from '../steps/StepVariantContext.ts';

export interface SlideProps {
  /**
   * Identifier of the slide shown in the location hash.
   *
   * Slides without an id are identified by `slide=<n>`.
   */
  id?: string;
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
  /** Variant of the steps on the slide that don't set their own. */
  steps?: StepVariant | undefined;
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
  master = 'content',
  title,
  className,
  steps,
  from,
  after,
  to,
  before,
  children,
}: SlideProps): JSX.Element {
  const theme = useTheme();
  // Before painting, so that the slide doesn't show a step outside the range.
  const store = use(StepStoreContext);
  useLayoutEffect(() => {
    store.setRange(
      from === undefined &&
        after === undefined &&
        to === undefined &&
        before === undefined
        ? undefined
        : { from, after, to, before },
    );
    return () => {
      store.setRange(undefined);
    };
  }, [store, from, after, to, before]);
  // Masters are looked up rather than defined during render, so their state is
  // preserved. Use `createElement` to avoid tripping `static-components`.
  return (
    <StepVariantContext value={steps}>
      {createElement(
        resolveMaster(master, theme.master),
        { title, className },
        children,
      )}
    </StepVariantContext>
  );
}
