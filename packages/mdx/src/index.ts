export type * from './jsxTypes.ts';
export { directiveHandlers } from './directives/directiveHandlers.ts';
export {
  getSeminarConfigs,
  remarkSeminarConfig,
  type LoadedSeminarConfigEntry,
  type RemarkSeminarConfigOptions,
} from './config/remarkSeminarConfig.ts';
export {
  parseDirectiveComponents,
  remarkDirectiveComponents,
  type DirectiveComponent,
  type DirectiveComponents,
  type RemarkDirectiveComponentsOptions,
} from './directives/remarkDirectiveComponents.ts';
export { getContentUiLocale, type UiLocaleSource } from './deck/uiLocales.ts';
export { deckMarkdown, type DeckMarkdownOptions } from './deck/markdown.ts';
export {
  getDeckFrontmatter,
  readDeckFrontmatter,
  type DeckDefaults,
} from './deck/frontmatter.ts';
export {
  CONFIG_CONDITION,
  importWithNode,
  loadSeminarConfig,
  loadThemeConfig,
  type ImportedModule,
  type LoadedSeminarConfig,
  type LoadedThemeConfig,
  type ModuleImporter,
  type ModuleResolver,
} from './config/themeConfig.ts';
export {
  deckMdxOptions,
  seminarMdxOptions,
  type DeckMdxOptions,
  type SeminarMdxOptions,
} from './options.ts';
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
export { remarkStepDirectives } from './steps/remarkStepDirectives.ts';
export { remarkSteps } from './steps/remarkSteps.ts';
export {
  emptyMdxPlugins,
  loadDeckSetup,
  readDeckTheme,
  resolveThemeKey,
  type DeckSetup,
  type DeckSetupOptions,
  type MdxPlugins,
  type MdxPluginStage,
  type StagePlugins,
} from './config/deckSetup.ts';
export {
  getFrontmatter,
  getSeminarOptionLayers,
  getSeminarOptions,
  setRuntimeSeminarOptions,
  type SeminarOptionsLayer,
} from './config/seminarOptions.ts';
export { parseAttributeWords } from './directives/attributeWords.ts';
export { getAttributes, type Attributes } from './directives/directives.ts';
export { getStepProps } from './steps/remarkSteps.ts';
export {
  createEsm,
  createExpressionAttribute,
  createStringAttribute,
} from './utils/estree.ts';
export { EXPLICIT_JSX, EXPLICIT_JSX_HAST } from './utils/jsx.ts';
