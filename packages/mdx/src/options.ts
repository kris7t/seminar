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
import { remarkImages } from './content/remarkImages.ts';
import { remarkNotes } from './deck/remarkNotes.ts';
import { directiveHandlers } from './directives/directiveHandlers.ts';
import {
  emptyMdxPlugins,
  loadDeckSetup,
  readDeckTheme,
  type DeckSetup,
  type MdxPlugins,
} from './config/deckSetup.ts';
import { rehypeListSteps } from './steps/rehypeListSteps.ts';
import { rehypeSlideElements } from './content/rehypeSlideElements.ts';
import { remarkSlides, type RemarkSlidesOptions } from './deck/remarkSlides.ts';
import { remarkStepDirectives } from './steps/remarkStepDirectives.ts';
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
  /**
   * Compile-time configs of the plugins and the theme of the deck, in
   * increasing precedence, see `loadDeckSetup`.
   */
  sliderConfigs?: readonly LoadedSliderConfigEntry[] | undefined;
  /** Plugins of unified that the configs add, see `loadDeckSetup`. */
  mdxPlugins?: MdxPlugins | undefined;
}

/**
 * Options for compiling `.deck.mdx` documents into decks with MDX. Pass them
 * to `@mdx-js/mdx` or one of its integrations.
 *
 * Decks use directives (with `remark-directive`): `:::notes` for presenter
 * notes (see {@link remarkNotes}), `:step` for steps (see
 * {@link remarkSteps} and {@link remarkStepDirectives}), and `:slide` and `::slide` for slides (see
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
  mdxPlugins = emptyMdxPlugins(),
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
      ...mdxPlugins.remarkPlugins.before,
      remarkDirective,
      remarkNotes,
      remarkStepDirectives,
      remarkImages,
      remarkSteps,
      [
        remarkSlides,
        {
          ...options,
          onDependency,
          syntaxPlugins: mdxPlugins.remarkPlugins.before,
        },
      ],
      [remarkSliderConfig, { configs: sliderConfigs }],
      [remarkDirectiveComponents, { directives }],
      ...mdxPlugins.remarkPlugins.after,
    ],
    rehypePlugins: [
      ...mdxPlugins.rehypePlugins.before,
      rehypeListSteps,
      rehypeSlideElements,
      ...(math === false
        ? []
        : [
            [rehypeMath, { math, importModule, onDependency }] satisfies [
              typeof rehypeMath,
              RehypeMathOptions,
            ],
          ]),
      ...mdxPlugins.rehypePlugins.after,
    ],
    recmaPlugins: [
      ...mdxPlugins.recmaPlugins.before,
      recmaSlideTitles,
      recmaSlideExports,
      ...mdxPlugins.recmaPlugins.after,
    ],
  };
}

export interface DeckMdxOptions extends Omit<
  SliderMdxOptions,
  'sliderConfigs' | 'mdxPlugins'
> {
  /** Slider plugins of the integration, e.g., `['@slider/elements']`. */
  plugins?: readonly string[] | undefined;
  /** Path to resolve `plugins` from. Defaults to the deck. */
  pluginsImporter?: string | undefined;
}

/**
 * Returns the options for compiling the deck at `deckPath` with `source`:
 * loads the configs of `plugins` and of the theme of the deck, which its
 * frontmatter or `defaultTheme` names, and the plugins they refer to (see
 * {@link loadDeckSetup}).
 *
 * Integrations that compile many decks should load the setup once for each
 * theme instead, like `@slider/rollup-plugin`.
 *
 * @returns The options, and the problems with the configs.
 */
export async function deckMdxOptions(
  source: string,
  deckPath: string,
  { plugins, pluginsImporter = deckPath, ...options }: DeckMdxOptions = {},
): Promise<{
  options: ReturnType<typeof sliderMdxOptions>;
  setup: DeckSetup;
}> {
  const setup = await loadDeckSetup({
    plugins,
    theme: readDeckTheme(source) ?? options.defaultTheme,
    pluginsImporter,
    themeImporter: deckPath,
    importModule: options.importModule,
  });
  return {
    options: sliderMdxOptions({
      ...options,
      sliderConfigs: setup.sliderConfigs,
      mdxPlugins: setup.mdxPlugins,
    }),
    setup,
  };
}
