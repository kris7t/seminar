import type { CompileOptions } from '@mdx-js/mdx';
import remarkFrontmatter from 'remark-frontmatter';

import { recmaSlideTitles } from './recmaSlideTitles.ts';
import { rehypeListSteps } from './rehypeListSteps.ts';
import { remarkSlides, type RemarkSlidesOptions } from './remarkSlides.ts';

/**
 * Options for compiling `.deck.mdx` documents into decks with MDX. Pass them
 * to `@mdx-js/mdx` or one of its integrations.
 */
export function sliderMdxOptions(
  options?: RemarkSlidesOptions,
): Pick<CompileOptions, 'remarkPlugins' | 'rehypePlugins' | 'recmaPlugins'> {
  return {
    remarkPlugins: [remarkFrontmatter, [remarkSlides, options]],
    rehypePlugins: [rehypeListSteps],
    recmaPlugins: [recmaSlideTitles],
  };
}
