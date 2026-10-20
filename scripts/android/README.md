# Testing in Chromium on Android

Some bugs only show in Chrome on Android, e.g., slides that move by the height
of the address bar while they fade. These scripts reproduce them in a headless
Android emulator with a recent Chromium.

## Requirements

- The Android SDK with its command-line tools, in `ANDROID_HOME`, or in
  `~/Android/Sdk` by default.
- KVM, i.e., read and write access to `/dev/kvm`.
- About 5 GB of disk for the system image, the emulator, and Chromium.

## Usage

Serve the example deck, start the emulator, and open the deck in it:

```sh
npm run dev
scripts/android/start-emulator.sh 'http://localhost:5173/#revealing-content'
```

`start-emulator.sh` installs the system image and creates the virtual device
`slider`, if needed, downloads Chromium into `~/.cache/slider-android`, boots
the emulator, and opens the URL in Chromium. Calling it again opens another
URL in the running emulator. Set `PORT` if the dev server doesn't listen on
5173, and `CHROMIUM_REVISION` to try another build from the
[Chromium snapshots](https://commondatastorage.googleapis.com/chromium-browser-snapshots/index.html?prefix=AndroidDesktop_x64/).

Then tap the slide and see whether the page moves while it changes:

```sh
scripts/android/record-tap.js
```

It prints how far the page moved vertically in each frame, in CSS pixels, and
exits with 1 if it moved. Animations play at a tenth of their speed, so that
the few frames that the emulator renders catch them. See
`record-tap.js --help` for the options, e.g., `--out` to save the frames.

Stop the emulator with `adb emu kill`.

## Pitfalls

- The API 37 system image crashes in SurfaceFlinger with emulator 37.2
  (`Assertion failed: !rcEnc->featureInfo()->hasReadColorBufferDma`), which
  takes down the system services, so the scripts use API 36.
- The system images come with an older Chrome, so the scripts install
  Chromium, which handles the address bar like Chrome.
- Older `avdmanager` versions create devices with an 800 MB data partition,
  which Chromium doesn't fit in, so the script enlarges it.
