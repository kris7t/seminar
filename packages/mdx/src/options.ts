import type { CompileOptions } from '@mdx-js/mdx';
import remarkDirective from 'remark-directive';
import remarkFrontmatter from 'remark-frontmatter';
import remarkMath from 'remark-math';

import {
  rehypeMath,
  type MathConfig,
  type RehypeMathOptions,
} from './math/rehypeMath.ts';
import { recmaSlideTitles } from './recmaSlideTitles.ts';
import { remarkNotes } from './remarkNotes.ts';
import { rehypeListSteps } from './rehypeListSteps.ts';
import { remarkSlides, type RemarkSlidesOptions } from './remarkSlides.ts';

export interface SliderMdxOptions
  extends RemarkSlidesOptions, Omit<RehypeMathOptions, 'math'> {
  /**
   * Defaults for rendering math (see {@link rehypeMath}), or `false` to
   * disable math, so that `$` is not special in decks.
   */
  math?: MathConfig | false | undefined;
}

/**
 * Options for compiling `.deck.mdx` documents into decks with MDX. Pass them
 * to `@mdx-js/mdx` or one of its integrations.
 *
 * Decks support directives (with `remark-directive`), e.g., `:::notes` for
 * presenter notes (see {@link remarkNotes}). Other directives are left to
 * other remark plugins. As usual with `remark-directive`, a colon followed by
 * a word in text, like `a:b`, starts a text directive, so write `a\:b`
 * instead.
 */
export function sliderMdxOptions({
  math,
  importModule,
  onDependency,
  ...options
}: SliderMdxOptions = {}): Pick<
  CompileOptions,
  'remarkPlugins' | 'rehypePlugins' | 'recmaPlugins'
> {
  return {
    remarkPlugins: [
      remarkFrontmatter,
      ...(math === false ? [] : [remarkMath]),
      remarkDirective,
      remarkNotes,
      [remarkSlides, options],
    ],
    rehypePlugins: [
      rehypeListSteps,
      ...(math === false
        ? []
        : [
            [rehypeMath, { math, importModule, onDependency }] satisfies [
              typeof rehypeMath,
              RehypeMathOptions,
            ],
          ]),
    ],
    recmaPlugins: [recmaSlideTitles],
  };
}
