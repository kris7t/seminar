import { useTheme } from '@mui/material';
import { createElement, type JSX, type ReactNode } from 'react';

import type { SlideMaster, SlideMasters } from '../masters/SlideMaster.ts';
import type { StepVariant } from '../steps/Step.tsx';
import { StepVariantContext } from '../steps/StepVariantContext.ts';

export interface SlideProps {
  /**
   * Identifier of the slide shown in the location hash.
   *
   * Slides without an id are identified by `slide=<n>`.
   */
  id?: string;
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
  children,
}: SlideProps): JSX.Element {
  const theme = useTheme();
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
