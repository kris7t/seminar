# @seminar/cli

Command line for [Seminar](https://seminar.run) presentations. Requires
Node.js 24 or newer.

```sh
npm install --save-dev @seminar/cli
npx vite build
npx seminar pdf
```

`seminar pdf` saves each deck built into `dist/` as a PDF next to it. Choose
handouts with `--layout notes` or `--layout grid`, and see `seminar --help`
for the other options.

Seminar saves PDFs with [Electron](https://www.electronjs.org/), which it
downloads into the cache directory of your user account the first time.
Run `seminar install-electron` to download it ahead of time.

| Environment variable | What it sets                                 |
| -------------------- | -------------------------------------------- |
| `SEMINAR_CACHE_DIR`  | The cache directory, e.g., to cache it in CI |
| `SEMINAR_ELECTRON`   | The executable of an Electron to run instead |
