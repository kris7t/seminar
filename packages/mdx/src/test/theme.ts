/** Stand-in for a theme module in tests. */
export default { name: 'test theme' };

/** The compile-time config of the theme, since it has no `slider` condition. */
export const slider = {
  math: { font: 'fira', macros: { R: '\\mathbb{R}', T: 'theme' } },
};
