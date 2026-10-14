export {
  parseAttributeBlock,
  splitLeadingAttributeBlock,
  splitTrailingAttributeBlock,
  type AttributeBlock,
} from './attributes.ts';
export {
  getDeckFrontmatter,
  readDeckFrontmatter,
  type DeckDefaults,
} from './frontmatter.ts';
export {
  rehypeMath,
  type MathConfig,
  type RehypeMathOptions,
} from './math/rehypeMath.ts';
export {
  CONFIG_CONDITION,
  importWithNode,
  loadThemeConfig,
  type ImportedModule,
  type LoadedThemeConfig,
  type ModuleImporter,
} from './math/themeConfig.ts';
export { sliderMdxOptions, type SliderMdxOptions } from './options.ts';
export { recmaSlideTitles } from './recmaSlideTitles.ts';
export { rehypeListSteps } from './rehypeListSteps.ts';
export { remarkSlides, type RemarkSlidesOptions } from './remarkSlides.ts';
