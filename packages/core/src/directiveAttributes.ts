import type { JSX } from 'react';

import type { ImageProps } from './content/Image.tsx';
import type { SlideMasterName, SlideMasters } from './masters/SlideMaster.ts';
import type { SlideProps } from './slide/Slide.tsx';
import type { StepProps } from './steps/Step.tsx';

/**
 * Attributes of `:step`, `::step`, and `:::step` in MDX, the props of the
 * step, e.g., `:step{with=initial group=parse}` or `:step{only}`. `#id`
 * sets the `id`, and classes the `className`.
 */
export interface StepDirectiveAttributes extends Omit<
  StepProps,
  'children' | 'component' | 'defaults' | 'sx'
> {
  /**
   * The element that renders the content of `:step[…]`, `::step[…]`, or
   * `:::step`, e.g., `section`. Defaults to `span` in the text, a paragraph
   * on a line of its own, and `div` around blocks.
   */
  component?: keyof JSX.IntrinsicElements | undefined;
}

/**
 * Shorthands for the masters of slides in MDX, e.g., `## Results {section}`
 * for `master=section`.
 */
export type SlideMasterShorthands = {
  [Name in keyof SlideMasters]?: true | undefined;
};

/**
 * Attributes of slides in MDX, in a block at the end of their heading, e.g.,
 * `## Title {#id .wide steps=dim}`, or on `::slide`. `#id` sets the id of the
 * slide, and classes its `className`. A bare word other than the flags of
 * slides sets the master, like `section` (see
 * {@link SlideMasterShorthands}).
 */
export interface SlideDirectiveAttributes
  extends
    Omit<SlideMasterShorthands, 'title'>,
    Pick<
      SlideProps,
      | 'id'
      | 'steps'
      | 'from'
      | 'after'
      | 'to'
      | 'before'
      | 'split'
      | 'lang'
      | 'cut'
      | 'fade'
      | 'fadeIn'
      | 'fadeOut'
      | 'fadeBefore'
      | 'fadeAfter'
    > {
  /**
   * The master that lays out the slide: a component imported or declared in
   * the deck, or else a master of the theme.
   */
  master?: SlideMasterName | (string & {}) | undefined;
  /**
   * Title of the slide in the table of contents, instead of its heading. As
   * a bare word, it sets the `title` master.
   */
  title?: string | true | undefined;
  /**
   * Whether the slide is spare, e.g., a backup slide for questions. A
   * division makes its slides spare, unless they have `spare=false`.
   */
  spare?: boolean | undefined;
  /**
   * Whether the heading only starts a division in the table of contents and
   * the overview, without a slide of its own.
   */
  noslide?: boolean | undefined;
}

/**
 * Attributes of `::recap[#id]` in MDX, which shows the slide `id` again.
 * `#id` sets the id of the recap. The rest is taken from the recapped slide.
 */
export type RecapDirectiveAttributes = Pick<
  SlideDirectiveAttributes,
  'id' | 'title' | 'spare' | 'from' | 'after' | 'to' | 'before'
>;

/**
 * Attributes of `::include[./deck.deck.mdx#id]` in MDX, which includes a
 * slide, a division, or a whole deck. `#id` sets the id of an included slide
 * or division.
 */
export interface IncludeDirectiveAttributes extends Pick<
  SlideDirectiveAttributes,
  'id' | 'title' | 'spare' | 'lang'
> {
  /**
   * Whether to copy the slides, which then have their own state, rather than
   * sharing it with the slides they include.
   */
  copy?: boolean | undefined;
  /**
   * The first step to show of an included slide, or the first slide to
   * include of a deck, by its id.
   */
  from?: string | undefined;
  /**
   * The step after which to show the steps of an included slide, or the
   * slide after which to include the slides of a deck, by its id.
   */
  after?: string | undefined;
  /** The last step to show of an included slide, or the last slide of a deck. */
  to?: string | undefined;
  /**
   * The step before which to stop showing the steps of an included slide,
   * or the slide of a deck before which to stop including slides.
   */
  before?: string | undefined;
}

/** Attributes of `:::notes` in MDX, which takes none. */
// eslint-disable-next-line @typescript-eslint/no-generated-empty-object-type -- No attributes at all.
export type NotesDirectiveAttributes = Record<never, never>;

/**
 * Attributes of images in MDX, in a block after them, e.g.,
 * `![Diagram](diagram.svg){#arch width=600 step}`, the props of the
 * `Image`.
 */
export type ImageDirectiveAttributes = Omit<
  ImageProps,
  'src' | 'alt' | 'caption' | 'block' | 'sx'
>;
