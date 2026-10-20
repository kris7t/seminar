/**
 * The plugins of unified that `@seminar/plugin-mathjax` adds to the compiler
 * of decks, see its config.
 */
export { default as remarkMath } from 'remark-math';
export type { MathConfig } from './mathConfig.ts';
export { rehypeMathJax } from './rehypeMathJax.ts';
