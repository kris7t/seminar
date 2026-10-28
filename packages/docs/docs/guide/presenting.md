---
sidebar_position: 5
---

# Presenting

Open a built deck's HTML file or its development-server address in a modern
browser. Right-click, long-press, or use the menu button in the top right
corner to find the presentation controls and their keyboard shortcuts.

## Navigation

Right, Down, and Space reveal the next step. Left, Up, and Shift+Space go
back. After the last step, advancing moves to the next slide; going back
from the first step returns to the previous slide.

Page Down and Page Up move between slides, showing the steps last shown on
each one. Home goes to the first slide, and End to the last step of the last
slide. Shift+Home and Shift+End go to the first or last step of the current
slide. Press G or `:` to jump to a slide by number.

### Mouse and touch

Click a slide or scroll down to advance. Shift+click or scrolling up goes
back. If a text field is focused or text is selected, a click dismisses
that first.

On a touch screen:

- Tap to advance to the next step.
- Tap the left quarter of the slide, or the margin to its left, to go back.
- Swipe to change slides.
- Pinch to open the slide overview.
- Long-press to open the menu.

### Interactive content

Buttons, text fields, and other interactive components handle their own
input. Keys used by a focused field stay with that field. Press Escape to
move the focus away so the navigation keys control the deck again.

Press S, or choose **Text selection** from the menu, to select and copy text
with the mouse instead of changing steps by clicking. Press S again to
return to click navigation.

## Overview and table of contents

Press O to see the deck as thumbnails. Select a slide to go to it. With the
keyboard, use the arrow keys to select a thumbnail and Enter to open it;
Up and Down jump between sections. Escape closes the overview without
leaving your current slide.

Press T to open the table of contents, or Shift+T to show the steps of the
current slide. Use these to jump to a topic or a particular step.
[Spare slides](core/decks.md#spare-slides-and-divisions), which ordinary
navigation skips, can be reached through the overview, table of contents,
or slide-number dialog.

## Presenter view

Press Shift+P, or choose **Presenter view** from the menu. A separate window
shows the slides to the audience. Your original window shows:

- The current slide, which you can interact with.
- Previews of the next step and slide; clicking a preview advances.
- Your [presenter notes](core/content.md#presenter-notes).
- A toolbar with the elapsed time and the current time.

Press N to focus on the notes, hiding the previews, or to show them again.
Press R to reset the elapsed time.

Interactive components share their state between the presenter and
audience windows, so you can operate a demonstration while the audience
watches it. Clicks on the notes select their text instead of changing steps.

### Full screen and screens

Press P, or choose **Start presentation**, to enter full screen. In a
Chromium-based browser with several screens, Seminar can ask which screen
should show the slides. You can also open the presenter view and move the
audience window to the screen you want to use.

To present without the permission prompts of the browser, run
`npx seminar present` after building the presentation. It also shows the
slides on the screen you choose on Wayland, where browsers can't, if the
compositor supports it, like Sway, COSMIC, KDE Plasma, or GNOME with the
Window Calls extension. See the
[`@seminar/cli` package](https://github.com/kris7t/seminar/tree/main/packages/cli#readme).

Press P again to stop presenting. Shift+P toggles the presenter view.

### Show your pointer

In the presenter view, press M to show your pointer to the audience. The
audience sees its shape, hovered and focused controls, and text caret and selection.
Press L to switch between an ordinary pointer and a laser pointer.

Set `mirrorPointer: true` in the deck's
[frontmatter](core/decks.md#frontmatter) to start with pointer mirroring
enabled.

## Slide and deck state

Choose **Reset slide** in the menu to restore the current slide's shared
state and return to the first step of its range.

**Reset deck** starts the deck over: it clears all deck and slide state,
including transient values, resets every slide and recap to the first step
of its own range, and shows the first non-spare slide of the deck.

## Printing

Choose **Print…** in the menu, or press Ctrl+P (Cmd+P on macOS), to print
the deck. To get a PDF, choose to save as PDF in the print dialog of the
browser. The **Layout** decides what goes on each sheet:

- **Slides**: each slide on a sheet as large as the slide.
- **Slide with notes**: each slide across a portrait sheet, with the
  presenter notes of the slide below it, as a handout.
- **Several slides per sheet**: 2 or 6 slides on a portrait sheet, or 4 on
  a landscape one.

For the handouts, choose the paper, like A4 or Letter, in the print dialog of
the browser: the slides fit its width. Browsers that can't fit them, like
some versions of Firefox, print them at the width of A4 or Letter instead.

Handouts have the title of the deck, its
[authors, event, and date](core/decks.md#frontmatter) at the top of each
sheet, and the number of the sheet at the bottom, instead of the header and
footer of the browser. Turn off **Headers and footers** to leave them out.

Slides with steps are [split into pages](core/steps.md#splitting-into-pages)
by default, so that everything they show is on some page. Choose **A page
for every step** to print each step instead. Turn on **Include spare slides**
to print spare slides, too, where they are in the deck.

### Saving PDFs

In a project created with `npm create seminar`, run `npm run pdf` to build
the presentation and save the PDFs you chose during setup, like
`dist/index.pdf` for the slides and `dist/index-notes.pdf` for a handout
with notes. Slides are split into pages like when printing, PDF viewers
show the numbers of the slides as page numbers, and the outline of the PDF
is the table of contents of the deck.

The first time, `npm run pdf` downloads the browser that saves the PDFs,
about 100 MB.

To save other layouts, or to save PDFs in other projects, see the
[`@seminar/cli` package](https://github.com/kris7t/seminar/tree/main/packages/cli#readme).

## Interface language

If the deck offers several interface languages, choose **Language** in the
menu to switch between them. This changes menus and tooltips, while the
deck's content keeps its own [language](core/decks.md#languages).

## Keyboard shortcuts

| Key                   | Action                                             |
| --------------------- | -------------------------------------------------- |
| Right, Down, Space    | Next step                                          |
| Left, Up, Shift+Space | Previous step                                      |
| Page Down, Page Up    | Next or previous slide                             |
| Home, End             | First slide, last step of the last slide           |
| Shift+Home, Shift+End | First or last step of the current slide            |
| G or `:`              | Go to a slide by number                            |
| O                     | Open or close the overview                         |
| T                     | Open or close the table of contents                |
| Shift+T               | Open or close the current slide's steps            |
| P                     | Start or stop presenting in full screen            |
| Shift+P               | Open or close the presenter view                   |
| N                     | Toggle notes focus in the presenter view           |
| M                     | Show or hide the pointer to the audience           |
| L                     | Switch between ordinary and laser pointers         |
| R                     | Reset elapsed time in the presenter view           |
| S                     | Switch between text selection and click navigation |
| Ctrl+P                | Print the deck                                     |
| Escape                | Unfocus, close the overview or presenter view      |
