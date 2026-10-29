# Seminar

Maintain scientific talks and lectures as Markdown presentations.

Seminar turns `.deck.mdx` files into presentations built with React and
[Material UI](https://mui.com/). Slides are plain text under version control,
styled by themes, and can contain interactive React components. A production
build is a single, self-contained HTML file that works offline.

> **Status:** proof of concept. APIs and the Markdown syntax may still change.

## Getting started

Seminar needs Node.js 22 or newer. Create a presentation project with:

```sh
npm create seminar@latest my-talk
cd my-talk
npm run dev
```

Choose plugins and either the default theme or an editable theme with Roboto.
Self-contained builds are enabled by default; you can disable them during setup.
Choose which PDFs `npm run pdf` saves, like the slides or handouts with notes.
The setup also offers to install dependencies; if you skip that step, run
`npm install` before starting the development server.
See [Getting started](packages/docs/docs/guide/getting-started.md) to create
a project or configure an existing one.

To work on Seminar itself:

```sh
npm install
npm run dev      # serve the example deck with hot reloading
npm run present  # build the example deck and present it with seminar present
npm run build    # build the example deck and documentation site
npm run check    # format check, build, lint, and test
npm run docs:dev # serve the documentation site with hot reloading
```

The example deck in [`packages/example/index.deck.mdx`](packages/example/index.deck.mdx)
shows most of the features below.

## Writing decks

A deck is an MDX file whose name ends in `.deck.mdx`. Starter projects keep
them in `decks/`, with components and custom themes in `src/`. The `@/`
alias points to `src/`, and a custom theme is selected for all decks in the
Vite configuration:

```mdx
import { Calculator } from '@/Calculator.tsx';

# My talk

Subtitle of the title slide

## A section

### A content slide {#content}

- Bullet points are shown up front
- :step This one appears in a new step
- and the ones after it along with it

![Architecture](./arch.svg){#arch width=600 step}

::callout[The parser]{for=arch at=30%,40%}

The formula $e^{i\pi} + 1 = 0$ is typeset at build time, with a plugin.

<Calculator />

:::notes
Presenter notes, shown only to the presenter.
:::
```

Headings start slides, `:step` reveals content step by step, and attributes in
braces name slides and elements. Decks can also show slides again in recaps,
include slides of other decks, mark spare slides for questions, and switch the
interface language.

See the [user guide](packages/docs/docs/guide/index.md) for setup, syntax,
and presentation controls:

- [Getting started](packages/docs/docs/guide/getting-started.md)
- [Editing and live preview](packages/docs/docs/guide/editing.md)
- [Presenting](packages/docs/docs/guide/presenting.md): controls and presenter view
- [Decks and slides](packages/docs/docs/guide/core/decks.md)
- [Content](packages/docs/docs/guide/core/content.md): images, math, code, notes, and components
- [Steps](packages/docs/docs/guide/core/steps.md)
- [Recaps and includes](packages/docs/docs/guide/core/reuse.md)
- [Elements](packages/docs/docs/guide/plugins/elements/index.md): callouts and columns
- [Math](packages/docs/docs/guide/plugins/mathjax/index.md) with MathJax
- [Diagrams](packages/docs/docs/guide/plugins/pele/index.md) with Pele
- [Highlighting code](packages/docs/docs/guide/plugins/shiki/index.md) with Shiki
- [Developers](packages/docs/docs/developer/index.md): components, plugins, and themes

Decks can also be written in JSX with `Deck` and `Slide` from `@seminar/core`;
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
| Ctrl+P                | Print the deck, e.g., to save it as a PDF      |
| Esc                   | Unfocus, close the overview or presenter view  |

Clicking a slide or scrolling down goes to the next step, and Shift+click or
scrolling up to the previous one.
If a text field is focused or some text is selected, a click dismisses them
first.
On touch screens, tap to go to the next step, tap the left quarter of the slide
or the margin left of it to go to the previous step, swipe to change slides,
and pinch to open the overview.

### Presenter view

The presenter view opens a separate window for the audience, while the deck
window shows the current slide, previews of the next step and slide, the
notes, and a toolbar with a timer and the clock. Clicking the previews also
goes to the next step, while clicks on the notes select their text. With
several screens in a Chromium-based browser, Start presentation asks which
screen to show the slides on. To present a deck without the permission
prompts, use `seminar present`, which builds it first. It also shows the slides on the chosen screen
on Wayland, where browsers can't.

Both windows render the same slide with shared state, so interactive slides
work in front of the audience. The mouse pointer can be shown to the
audience, too (M, or `mirrorPointer: true` in the frontmatter to start with
it). The audience then also sees its shape, hover and focus styles, the caret
and selection of text fields, selected text, and the ripples of buttons.

### Printing and PDFs

Ctrl+P prints the deck from the browser, as slides, slides with notes, or
several slides per sheet. Slides with steps are split into as few pages as
needed to show everything. `npm run pdf` saves the same layouts as PDFs, with
the table of contents as their outline and the numbers of the slides as page
numbers.

## Packages

| Package                                              | Description                                                    |
| ---------------------------------------------------- | -------------------------------------------------------------- |
| [`create-seminar`](packages/create)                  | Creates a presentation project with Vite, plugins, and a theme |
| [`@seminar/cli`](packages/cli)                       | Command line that presents built decks and saves them as PDFs  |
| [`@seminar/core`](packages/core)                     | Deck, slides, steps, themes, and the presenter view            |
| [`@seminar/elements`](packages/elements)             | Reusable presentation elements and MDX directives              |
| [`@seminar/mdx`](packages/mdx)                       | Compiles decks written in MDX                                  |
| [`@seminar/plugin-mathjax`](packages/plugin-mathjax) | Math typeset with MathJax                                      |
| [`@seminar/plugin-pele`](packages/plugin-pele)       | Mermaid diagrams rendered with Pele                            |
| [`@seminar/plugin-shiki`](packages/plugin-shiki)     | Syntax highlighting of code blocks with Shiki                  |
| [`@seminar/rollup-plugin`](packages/rollup-plugin)   | Rollup and Vite plugin for `.deck.mdx` files                   |
| [`@seminar/vite-plugin`](packages/vite-plugin)       | Vite plugin with HTML pages and self-contained builds          |
| [`@seminar/theme-default`](packages/theme-default)   | Default theme with the Roboto font                             |
| [`@seminar/docs`](packages/docs)                     | Documentation site                                             |
| [`@seminar/example`](packages/example)               | Example deck                                                   |

To use Seminar in a Vite project, add the plugin along with the React plugin:

```ts
import seminar from '@seminar/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [seminar(), react()],
});
```

Every `.deck.mdx` file then gets its own HTML page. Pass
`seminar({ selfContained: false })` to keep scripts and assets in separate
files, e.g., for hosting with a Content Security Policy.

The page starts with the source of the deck as Markdown, without comments and
with included slides, and the deck rendered as a plain document, which
browsers that run the deck hide, so that clients without JavaScript, like text
extractors, can read it. Pass `seminar({ content: 'ssr' })` to only embed the
document, `'markdown'` to only embed the Markdown, or `'none'` to embed
nothing.

Presentation elements, like callouts and columns, come from
[`@seminar/elements`](packages/elements), which is enabled as a plugin:

```ts
seminar({ plugins: ['@seminar/elements'] });
```

## License

[Apache License 2.0](LICENSE)
