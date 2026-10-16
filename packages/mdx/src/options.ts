import type { CompileOptions } from '@mdx-js/mdx';
import remarkDirective from 'remark-directive';
import remarkFrontmatter from 'remark-frontmatter';
import remarkMath from 'remark-math';

import {
  rehypeMath,
  type MathConfig,
  type RehypeMathOptions,
} from './math/rehypeMath.ts';
import { recmaSlideExports } from './deck/recmaSlideExports.ts';
import { recmaSlideTitles } from './deck/recmaSlideTitles.ts';
import { remarkHeadingAttributes } from './directives/remarkHeadingAttributes.ts';
import { remarkNotes } from './notes/remarkNotes.ts';
import { directiveHandlers } from './directives/directiveHandlers.ts';
import { rehypeListSteps } from './steps/rehypeListSteps.ts';
import { remarkSlides, type RemarkSlidesOptions } from './deck/remarkSlides.ts';
import { remarkSteps } from './steps/remarkSteps.ts';
import {
  remarkDirectiveComponents,
  type DirectiveComponents,
} from './directives/remarkDirectiveComponents.ts';
import {
  remarkSliderConfig,
  type LoadedSliderConfigEntry,
} from './config/remarkSliderConfig.ts';

export interface SliderMdxOptions
  extends RemarkSlidesOptions, Omit<RehypeMathOptions, 'math'> {
  /**
   * Defaults for rendering math (see {@link rehypeMath}), or `false` to
   * disable math, so that `$` is not special in decks.
   */
  math?: MathConfig | false | undefined;
  /** React components that render named Remark directives. */
  directives?: DirectiveComponents | undefined;
  /** Compile-time configs supplied by the MDX integration. */
  sliderConfigs?: readonly LoadedSliderConfigEntry[] | undefined;
}

/**
 * Options for compiling `.deck.mdx` documents into decks with MDX. Pass them
 * to `@mdx-js/mdx` or one of its integrations.
 *
 * Decks use directives (with `remark-directive`): `:::notes` for presenter
 * notes (see {@link remarkNotes}), `:step` for steps (see
 * {@link remarkSteps}), and `:slide` and `::slide` for slides (see
 * {@link remarkSlides}). Other directives are left to other remark plugins,
 * and kept as text if none handles them (see {@link directiveHandlers}),
 * since a colon followed by a word, like in `10:30`, is parsed as a
 * directive.
 */
export function sliderMdxOptions({
  math,
  importModule,
  onDependency,
  directives,
  sliderConfigs,
  ...options
}: SliderMdxOptions = {}): Pick<
  CompileOptions,
  'remarkPlugins' | 'remarkRehypeOptions' | 'rehypePlugins' | 'recmaPlugins'
> {
  return {
    remarkRehypeOptions: { handlers: directiveHandlers },
    remarkPlugins: [
      remarkHeadingAttributes,
      remarkFrontmatter,
      ...(math === false ? [] : [remarkMath]),
      remarkDirective,
      remarkNotes,
      remarkSteps,
      [remarkSlides, { ...options, onDependency }],
      [
        remarkSliderConfig,
        { configs: sliderConfigs, importModule, onDependency },
      ],
      [remarkDirectiveComponents, { directives }],
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
    recmaPlugins: [recmaSlideTitles, recmaSlideExports],
  };
}
