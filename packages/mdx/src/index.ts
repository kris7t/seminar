export { directiveHandlers } from './directives/directiveHandlers.ts';
export {
  getSliderConfigs,
  remarkSliderConfig,
  type LoadedSliderConfigEntry,
  type RemarkSliderConfigOptions,
} from './config/remarkSliderConfig.ts';
export {
  parseDirectiveComponents,
  remarkDirectiveComponents,
  type DirectiveComponent,
  type DirectiveComponents,
  type RemarkDirectiveComponentsOptions,
} from './directives/remarkDirectiveComponents.ts';
export {
  getDeckFrontmatter,
  readDeckFrontmatter,
  type DeckDefaults,
} from './deck/frontmatter.ts';
export {
  rehypeMath,
  type MathConfig,
  type RehypeMathOptions,
} from './math/rehypeMath.ts';
export {
  CONFIG_CONDITION,
  importWithNode,
  loadSliderConfig,
  loadThemeConfig,
  type ImportedModule,
  type LoadedSliderConfig,
  type LoadedThemeConfig,
  type ModuleImporter,
} from './math/themeConfig.ts';
export { sliderMdxOptions, type SliderMdxOptions } from './options.ts';
export {
  recmaSlideExports,
  slideExportName,
} from './deck/recmaSlideExports.ts';
export { recmaSlideTitles } from './deck/recmaSlideTitles.ts';
export { rehypeListSteps } from './steps/rehypeListSteps.ts';
export {
  remarkHeadingAttributes,
  rewriteHeadingAttributes,
} from './directives/remarkHeadingAttributes.ts';
export { remarkSlides, type RemarkSlidesOptions } from './deck/remarkSlides.ts';
export { remarkSteps } from './steps/remarkSteps.ts';
