# slider

Maintain scientific talks and lectures as Markdown presentations.

slider turns `.deck.mdx` files into presentations built with React and
[Material UI](https://mui.com/). Slides are plain text under version control,
styled by themes, and can contain interactive React components. A production
build is a single, self-contained HTML file that works offline.

> **Status:** proof of concept. APIs and the Markdown syntax may still change.

## Getting started

slider needs Node.js 24 or newer.

```sh
npm install
npm run dev     # serve the example deck with hot reloading
npm run build   # build packages/example/dist/index.html
npm run check   # format check, build, lint, and test
```

The example deck in [`packages/example/index.deck.mdx`](packages/example/index.deck.mdx)
shows most of the features below.

## Writing decks

A deck is an MDX file whose name ends in `.deck.mdx`. Its frontmatter selects
the theme:

```mdx
---
theme: ./src/theme.tsx
---

import { Calculator } from './src/Calculator.tsx';

# My talk

Subtitle of the title slide

## A section

### A content slide

- Bullet points are shown up front
- \{step} This one appears in a new step
- and the ones after it along with it

<Calculator />

:::notes
Presenter notes, shown only to the presenter.
:::
```

- **Slides:** `#` starts the title slide, `##` a section, `###` a content slide,
  and `---` a slide without a title. `depth:` in the frontmatter shifts these
  levels.
- **Slide props:** an attribute block after a heading sets the id, the master,
  or the title in the table of contents, e.g., `\{#intro title=Introduction}`.
  Ids appear in the address, e.g., `#intro`.
- **Steps:** list items marked with `\{step}`, at their start or end, appear in
  new steps. `\{with=previous}` and `\{with=initial}` attach them to other
  steps, and `\{group=name}` reveals items together. `<Step>`, `<Steps>`, and
  `<Together>` from `@slider/core` do the same in JSX.
- **Math:** `$…$` and `$$…$$` are typeset with MathJax at build time, with
  MathML for screen readers. Themes choose the math font.
- **Notes:** `:::notes` blocks or `<Notes>` elements hold presenter notes.
- **Components:** imported React components can be used as slide content or as
  slide masters. `useSlideState` keeps their state in the slide, so that every
  view of the slide shows the same state.

Decks can also be written in JSX with `Deck` and `Slide` from `@slider/core`;
see [`ExampleDeck.tsx`](packages/example/src/ExampleDeck.tsx).

## Presenting

Open the built HTML file, or the dev server, in a modern browser. Right-click,
long-press, or use the menu button in the top right corner for all actions.

| Key                   | Action                                         |
| --------------------- | ---------------------------------------------- |
| Right, Down, Space    | Next step                                      |
| Left, Up, Shift+Space | Previous step                                  |
| Page Down, Page Up    | Next or previous slide, keeping its steps      |
| Home, End             | First slide, last step of the last slide       |
| Shift+Home, Shift+End | First or last step of the slide                |
| G or :                | Go to a slide by number                        |
| O                     | Overview of all slides                         |
| T                     | Table of contents                              |
| P                     | Start the presentation in full screen, or stop |
| Shift+P               | Open or close the presenter view               |
| N                     | Show only the notes in the presenter view      |
| M                     | Show the pointer to the audience, or hide it   |
| L                     | Turn the pointer into a laser pointer, or back |
| Esc                   | Close the overview or the presenter view       |

Clicking a slide goes to the next step, and Shift+click to the previous one.
On touch screens, tap to go to the next step, swipe to change slides, and pinch
to open the overview.

### Presenter view

The presenter view opens a separate window for the audience, while the deck
window shows the current slide, previews of the next step and slide, the
notes, and a toolbar with a timer and the clock. With several screens in a
Chromium-based browser, Start presentation asks which screen to show the
slides on.

Both windows render the same slide with shared state, so interactive slides
work in front of the audience. While the mirrored pointer is on, the audience
also sees the mouse pointer, hover and focus styles, the caret and selection
of text fields, and the ripples of buttons.

## Packages

| Package                                           | Description                                           |
| ------------------------------------------------- | ----------------------------------------------------- |
| [`@slider/core`](packages/core)                   | Deck, slides, steps, themes, and the presenter view   |
| [`@slider/mdx`](packages/mdx)                     | Compiles decks written in MDX                         |
| [`@slider/rollup-plugin`](packages/rollup-plugin) | Rollup and Vite plugin for `.deck.mdx` files          |
| [`@slider/vite-plugin`](packages/vite-plugin)     | Vite plugin with HTML pages and self-contained builds |
| [`@slider/theme-default`](packages/theme-default) | Default theme with Roboto and the Fira math font      |
| [`@slider/example`](packages/example)             | Example deck                                          |

To use slider in a Vite project, add the plugin along with the React plugin:

```ts
import slider from '@slider/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [slider(), react()],
});
```

Every `.deck.mdx` file then gets its own HTML page. Pass
`slider({ selfContained: false })` to keep scripts and assets in separate
files, e.g., for hosting with a Content Security Policy.

## License

[Apache License 2.0](LICENSE)
