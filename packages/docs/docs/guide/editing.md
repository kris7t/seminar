---
sidebar_position: 3
---

# Editing and live preview

Keep your editor and the preview side by side. Once you have
[created a project](getting-started.md), saving a deck updates the presentation
in place, so you can work on a slide while looking at it.

## Preview your changes

From your project directory, start the preview:

```sh
npm run preview
```

It starts the development server on a free port and opens the deck in the app
of `npm run present`, so you don't need to open it in a browser. Press P to try
the presentation on your screens without the permission prompts of the
browser. Run `npx seminar preview decks/talk.deck.mdx` to preview another
deck. See the
[`@seminar/cli` package](https://github.com/kris7t/seminar/tree/main/packages/cli#readme).

To preview in a browser instead, run `npm run dev`, and open the address Vite
prints.

Navigate to the slide you want to edit. Change `decks/index.deck.mdx` and save
it. With `@vitejs/plugin-react` enabled, Seminar keeps the current slide, open
panels, presenter view, and shared slide state when the deck updates.
Without the React plugin, a deck change reloads the page instead.

Vite also watches imported React components, styles, images, and other
dependencies. Some changes require a full reload or remount components,
which can reset their running state. A saved deck is the source of the
presentation; live state isn't saved back into the file.

If compilation fails, check Vite's error overlay and terminal output. Fix
the error and save again to update the preview.

## Work in your editor

Decks are text files, so you can search, replace, move slides, and review
changes with the tools you already use. Keep React components and theme
code in separate files and import them from the deck. An MDX-aware editor
can highlight the Markdown, JSX, and imports.

Use [slide ids](core/decks.md#slide-attributes), such as
`### Results {#results}`, to give important slides stable addresses while
you revise their titles. Keep the deck and its assets under version
control so you can review changes and return to earlier versions.

## Work with a coding agent

An agent can edit the same `.deck.mdx` files, components, and themes as you.
Give it the deck file, the slides you want changed, and any constraints on
content or layout. Point it to the [deck syntax](core/decks.md) and
[steps](core/steps.md), or the [developer documentation](../developer/index.md)
when it needs to write a component.

Review its changes in the editor and keep the live preview open as you
work. Go through the affected steps and try interactive elements; a text
diff alone won't show whether a slide fits or an animation makes sense.

## Rehearse and build

Use the [presenter view](presenting.md#presenter-view) to check notes and
previews. Try the [touch controls](presenting.md#mouse-and-touch) if you
will present from a tablet or phone.

Before sharing, [build the deck](getting-started.md#build-and-share) and open the
resulting HTML file. This checks the version you will actually present,
including its bundled fonts, images, and scripts.
