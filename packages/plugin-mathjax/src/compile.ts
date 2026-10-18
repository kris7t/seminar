/**
 * The plugins of unified that `@slider/plugin-mathjax` adds to the compiler
 * of decks, see its config.
 */
export { default as remarkMath } from 'remark-math';
export { rehypeMathJax, type MathConfig } from './rehypeMathJax.ts';
