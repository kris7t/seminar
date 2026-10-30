# @seminar/cli

The `seminar` command presents and previews [Seminar](https://seminar.run)
decks, and saves built decks as PDFs. It runs the decks in an app of its own, made with
Electron. Requires Node.js 24 or newer.

Projects created with `npm create seminar` already have it, with
`npm run present`, and `npm run pdf` if you chose PDFs. To add it to other
projects:

```sh
npm install --save-dev @seminar/cli
```

## Presenting

```sh
seminar present                       # build the deck of the project
seminar present decks/talk.deck.mdx   # build another deck
seminar present dist/talk.html        # a deck built already
seminar present dist                  # one of the decks built in dist/
```

`seminar present` builds the deck with `vite build` in the closest directory
with a Vite config, leaving out the other decks and pages of the project, and
presents it without touching `dist/`. It builds into
`node_modules/.cache/seminar/present/`, and removes the build when the
presentation ends, or when it is stopped, e.g., with Ctrl+C. Without a path, it builds the deck in
the root of the Vite project, e.g., `decks/`. If there are several decks, it
asks which one to present. The deck opens in
a window, and asks right away which screen should show the slides, as if you
pressed P. Unlike a browser, it doesn't ask for permissions first. Once you
stop presenting, or cancel choosing the screen, it quits, unless you give it
`--no-quit-at-end`.

On Wayland, browsers can't choose the screen of a window, so
`seminar present` asks the compositor instead. This works with:

- Sway, and other compositors with the wlr foreign toplevel management
  protocol,
- COSMIC,
- KDE Plasma,
- GNOME, with the
  [Window Calls](https://extensions.gnome.org/extension/4724/window-calls/)
  extension.

With other compositors, move the window of the slides to the screen of the
audience, and click it to go full screen.

## Previewing

```sh
seminar preview                       # the deck of the project
seminar preview decks/talk.deck.mdx   # another deck
```

`seminar preview` chooses the deck like `seminar present`, but serves it
with the dev server of Vite instead of building it, and opens it in the same
app, which updates the deck as you edit it. The title of its window says that
it's a preview, and it doesn't start presenting until you press P, which then
works like in `seminar present`, also on Wayland.

With `--present`, it starts presenting right away, and quits once you stop,
like `seminar present`. With `--no-quit-at-end`, it stays open instead.
`--quit-at-end` makes it start presenting right away and quit at the end,
too.

## Saving PDFs

`seminar pdf` saves each deck in `dist/` as a PDF next to it, like
`dist/index.pdf`. Build the decks first, e.g., in a script of your
`package.json`:

```json
"pdf": "vite build && seminar pdf"
```

The options match the Print dialog of the decks:

| Option                           | What it does                                 |
| -------------------------------- | -------------------------------------------- |
| `--layout <slides\|notes\|grid>` | Slides, slides with notes, or several slides |
| `--per-sheet <2\|4\|6>`          | Slides on each sheet of the grid layout      |
| `--every-step`                   | A page for every step                        |
| `--spares`                       | Include spare slides                         |
| `--no-headers`                   | Leave out headers and footers of handouts    |
| `--paper <size>`                 | Paper of handouts, like `A4` or `Letter`     |
| `--out-dir <dir>`                | Where to save the PDFs                       |

To save several layouts at once, separate them with commas, like
`--layout slides,notes,grid --per-sheet 4,6`. The PDF of the slides has the
name of the deck. Handouts add their layout to it, like `dist/index-notes.pdf`
and `dist/index-4up.pdf`.

The PDFs keep the title, authors, description, and keywords of the deck. Their
outline is the table of contents of the deck, or the titles of its slides.
With one slide on each sheet, the page numbers are the slide numbers.

## Electron

The app is made with [Electron](https://www.electronjs.org/). The first time
you use it, `seminar` downloads Electron into the cache directory of your
user account. To download it ahead of time, e.g., before a talk or in a step
of continuous integration, run `seminar install-electron`.

| Environment variable | What it sets                                 |
| -------------------- | -------------------------------------------- |
| `SEMINAR_CACHE_DIR`  | The cache directory, e.g., to cache it in CI |
| `SEMINAR_ELECTRON`   | The executable of an Electron to run instead |
