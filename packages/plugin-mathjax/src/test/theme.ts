/** Stand-in for a theme module in tests. */
export default { name: 'test theme' };

/** The compile-time config of the theme, since it has no `seminar` condition. */
export const seminar = {
  options: {
    math: { font: 'newcm', macros: { R: '\\mathbb{R}', T: 'theme' } },
  },
};
