# @seminar/cli

Command line for [Seminar](https://seminar.run) presentations. Requires
Node.js 24 or newer.

Projects created with `npm create seminar` already have it, and save PDFs
with `npm run pdf`. To add it to other projects:

```sh
npm install --save-dev @seminar/cli
```

## Saving PDFs

`seminar pdf` saves each deck built into `dist/` as a PDF next to it, like
`dist/index.pdf`. Build the decks first, e.g., in a script of your
`package.json`:

```json
"pdf": "vite build && seminar pdf"
```

Its options choose the same as the Print dialog of the decks:

| Option                           | What it does                                 |
| -------------------------------- | -------------------------------------------- |
| `--layout <slides\|notes\|grid>` | Slides, slides with notes, or several slides |
| `--per-sheet <2\|4\|6>`          | Slides on each sheet of the grid layout      |
| `--every-step`                   | A page for every step                        |
| `--spares`                       | Include spare slides                         |
| `--no-headers`                   | Leave out headers and footers of handouts    |
| `--paper <size>`                 | Paper of handouts, like `A4` or `Letter`     |
| `--out-dir <dir>`                | Where to save the PDFs                       |

To save several layouts at once, list them separated by commas, like
`--layout slides,notes,grid --per-sheet 4,6`. Handouts have their layout at
the end of their names, like `dist/index-notes.pdf` and `dist/index-4up.pdf`,
while the slides keep the name of the deck.

The PDFs have the title, authors, description, and keywords of the deck in
their properties, and the table of contents of the deck, or the titles of
its slides, as their outline. With one slide on each sheet, their page
numbers are the numbers of the slides.

## Electron

Seminar saves PDFs with [Electron](https://www.electronjs.org/), which it
downloads into the cache directory of your user account the first time.
Run `seminar install-electron` to download it ahead of time, e.g., in a
separate step of continuous integration.

| Environment variable | What it sets                                 |
| -------------------- | -------------------------------------------- |
| `SEMINAR_CACHE_DIR`  | The cache directory, e.g., to cache it in CI |
| `SEMINAR_ELECTRON`   | The executable of an Electron to run instead |
