// A theme that adds a slide master, which decks only know if the code of
// their directives imports the theme.
declare module '@seminar/core' {
  interface SlideMasterOverrides {
    wide: true;
  }
}

export {};
