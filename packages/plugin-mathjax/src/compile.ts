/**
 * The plugins of unified that `@seminar/plugin-mathjax` adds to the compiler
 * of decks, see its config, and the typesetting of formulas for other plugins
 * of the compiler.
 */
export { default as remarkMath } from 'remark-math';
export type { MathConfig } from './mathConfig.ts';
export { rehypeMathJax } from './rehypeMathJax.ts';
export {
  createFormulaTypesetter,
  type FormulaTypesetter,
  type TypesetFormula,
} from './typesetFormula.ts';
