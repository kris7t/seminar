# Testing `seminar present` in compositors

`seminar present` places the windows of a presentation through the
compositor where browsers can't, e.g., on Wayland. These tests present the
example deck in compositors that they start for themselves, drive the deck
over the Chrome DevTools Protocol, and check with the compositor where the
windows are:

- the screen dialog knows the screen of the presenter window, also after the
  compositor moves it,
- the slides go full screen on the other screen and fill it,
- Escape, or leaving full screen with the compositor, ends the presentation,
- on KWin, scripts that crashed processes left loaded are unloaded.

## Requirements

- Sway, with `swaymsg`, and KWin 6 (`kwin_wayland`). The tests for a
  compositor that isn't installed are skipped.
- `dbus-daemon`.
- The command line and the example deck, built with `npm run build`.
- The Electron of the command line, which the tests download if needed, like
  `seminar install-electron`.

## Usage

```sh
npm run build
npm run test:compositors
```

Each compositor runs headless, on two virtual outputs, in a session of its
own: a temporary directory for its home and XDG directories, and its own
session bus. So the tests don't touch the session that they run in, and they
stop every process that they start, with its children.

Sway renders in software by default, as in continuous integration, where
there's no GPU. Set `SEMINAR_E2E_RENDERER=gles2` to render with the GPU
instead, and `SEMINAR_E2E_DEBUG=1` to log the steps of the tests, and what
`seminar present` writes.
