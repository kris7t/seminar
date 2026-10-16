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

### A content slide {#content}

- Bullet points are shown up front
- :step This one appears in a new step
- and the ones after it along with it

:step So does this paragraph.

<Calculator />

:::notes
Presenter notes, shown only to the presenter.
:::
```

- **Slides:** `#` starts the title slide, `##` a section, `###` a content
  slide, `---` a slide without a title, and `::slide[Title]` one without a
  heading. `depth:` in the frontmatter shifts these levels.
- **Slide props:** attributes at the end of a heading set the id, the master,
  classes, or the title in the table of contents, e.g.,
  `## Intro {#intro .wide section title=Introduction}`. Ids appear in the
  address, e.g., `#intro`.
- **Element names:** ids inside a slide, like `<img id="arch">` or
  `:step{#parse}`, name elements on that slide only, so that slides can be
  shown several times at once, recapped, and included. `useSlideElement` finds
  them in components.
- **Spare slides:** `{spare}` marks a slide, or the slides of a section, as
  spare, e.g., for questions. Going through the deck skips them, but they can
  be chosen from the table of contents or the overview. `{noslide}` on a
  heading groups slides without a slide of its own.
- **Languages:** `lang:` in the frontmatter sets the language of the deck,
  defaulting to English, and `{lang=…}` that of a slide. The interface is in
  the language of the deck, if available (English, Hungarian, German, or
  French), and viewers can switch to English. `uiLanguages: [de, fr]` offers
  other languages, and `uiLanguages: [{ pt: ./pt.json }]` adds one from a file
  like those in [`packages/core/src/i18n/locales`](packages/core/src/i18n/locales).
- **Steps:** `:step` at the start of a list item or paragraph shows it in a new
  step. `:step{group=name}` reveals items together, and the address refers to
  it by name, e.g., `#intro&step=name`. A step with an id, like
  `:step{#name}`, is in the group `name`, unless it has a `group`. `:step{title=…}` names a step in the
  step tree (Shift+T). `<Step>`, `<Steps>`, and `<Together>` do the same in
  JSX.
- **Step behaviors:** `:step{only}` or `{steps=only}` on a slide sets how steps
  look before, during, and after their turn: `reveal` (the default), `dim`,
  `preview`, `focus`, `only`, or `scoped` (hidden once its parent step is
  past). `:step{in=name}` nests a step in the group `name`. Themes can add
  behaviors with `stepBehaviors`.
- **Step ranges:** `{from=…}`, `{after=…}`, `{to=…}`, and `{before=…}` on a
  slide limit the steps shown when going through it, e.g., `{after=1 to=parse}`.
- **Recaps:** `::recap[#id]` shows the slide `id` again, continuing its steps
  where its previous showing ended.
- **Includes:** `::include[./other.deck.mdx#id]` includes a slide or a section
  of another deck, and `::include[./other.deck.mdx]` the whole deck. Only the
  included slides are bundled.
- **Math:** `$…$` and `$$…$$` are typeset with MathJax at build time.
- **Notes:** `:::notes` blocks hold presenter notes.
- **Components:** imported React components can be used as slide content or as
  masters. `useSlideState` keeps their state in the slide, shared by every view
  of it, and `useResetSlideState` resets it.

Write `\:step` for a literal `:step`.

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
| Shift+T               | Steps of the current slide                     |
| P                     | Start the presentation in full screen, or stop |
| Shift+P               | Open or close the presenter view               |
| N                     | Show only the notes in the presenter view      |
| M                     | Show the pointer to the audience, or hide it   |
| L                     | Turn the pointer into a laser pointer, or back |
| R                     | Reset the time elapsed in the presenter view   |
| S                     | Select text with the mouse instead of clicking |
| Esc                   | Unfocus, close the overview or presenter view  |

Clicking a slide or scrolling down goes to the next step, and Shift+click or
scrolling up to the previous one.
If a text field is focused or some text is selected, a click dismisses them
first.
On touch screens, tap to go to the next step, swipe to change slides, and pinch
to open the overview.

### Presenter view

The presenter view opens a separate window for the audience, while the deck
window shows the current slide, previews of the next step and slide, the
notes, and a toolbar with a timer and the clock. Clicking the previews or the
notes also goes to the next step, so the mouse pointer doesn't have to be over
the slide, where the audience sees it. With several screens in a
Chromium-based browser, Start presentation asks which screen to show the
slides on.

Both windows render the same slide with shared state, so interactive slides
work in front of the audience. While the mirrored pointer is on, the audience
also sees the mouse pointer and its shape, hover and focus styles, the caret
and selection of text fields, selected text, and the ripples of buttons.

## Packages

| Package                                           | Description                                           |
| ------------------------------------------------- | ----------------------------------------------------- |
| [`@slider/core`](packages/core)                   | Deck, slides, steps, themes, and the presenter view   |
| [`@slider/elements`](packages/elements)           | Reusable presentation elements and MDX directives     |
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

## Elements

[`@slider/elements`](packages/elements) adds presentation elements as MDX
directives. Enable it as a plugin:

```ts
slider({ plugins: ['@slider/elements'] });
```

- **Callouts:** `:callout[Remember this]` shows a speech bubble
  pointing at its position in the text. It's a step whose default behavior is
  `scoped`. On a line of its own, `::callout[…]{at=x,y}` takes no room, e.g.,
  to point into an image, and `:::callout[Title]{at=x,y}` holds Markdown
  content up to the closing `:::`, left-aligned under a centered title. It fits
  its text up to `maxWidth`, unless `width` is set. `color` (a palette color
  like `secondary`, or a text color like `text.secondary`), `variant=outlined`,
  `align`, `angle`, and `elevation` (a shadow of the theme) change its look,
  and themes can set defaults and add variants with `SliderCallout` and
  `SliderCalloutTitle`.

## License

[Apache License 2.0](LICENSE)
