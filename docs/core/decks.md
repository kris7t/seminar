# Decks and slides

A deck is an MDX file whose name ends in `.deck.mdx`. Each deck becomes a
presentation of its own, e.g., an HTML page with the Vite plugin.

```mdx
---
theme: ./src/theme.tsx
lang: en
---

import { Calculator } from './src/Calculator.tsx';

# My talk

A subtitle

## Background

### Why it matters

- First point
- Second point
```

## Frontmatter

The YAML frontmatter at the top configures the whole deck. Every key is
optional.

| Key               | Meaning                                                                         |
| ----------------- | ------------------------------------------------------------------------------- |
| `theme`           | Module of the theme, e.g., `./src/theme.tsx` or a package                       |
| `title`           | Title of the deck, e.g., of its HTML page; defaults to the first heading        |
| `lang`            | Language of the deck, e.g., `hu`; defaults to English                           |
| `uiLanguages`     | Further languages of the user interface, see [Languages](#languages)            |
| `depth`           | Deepest heading level that starts a slide, see [Headings](#headings-and-slides) |
| `mouseNavigation` | `false` starts with text selection (S) instead of clicks changing steps         |
| `math`            | Options of math typesetting, see [Math](content.md#math)                        |

## Headings and slides

Headings divide the deck into slides:

- `#` starts the title slide,
- `##` a section, whose slide introduces the slides after it, and
- `###` a content slide.

The content after a heading, up to the next one, is on its slide. The text
right after the title and section headings is their subtitle.

Shorter decks may not need sections or a title slide. `depth` in the
frontmatter says which heading level starts content slides, and the levels
above it are sections and the title. It defaults to the deepest heading level
of the deck, so a deck with only `#` and `##` headings has a title slide and
content slides. Headings deeper than `depth` are ordinary headings on a slide.

Slides don't need a heading:

- `---` starts a slide without a title, and
- `::slide[Title]` starts a slide with a title, but without a heading on it,
  e.g., when a component shows the title itself.

## Slide attributes

Attributes in braces at the end of a heading set the props of its slide:

```mdx
## Introduction {#intro .wide section title=Intro}
```

- `#intro` sets the id of the slide, which appears in the address, e.g.,
  `…/talk.html#intro`. Without it, the id comes from the title, e.g.,
  `#introduction`.
- `.wide` adds a class to the slide, e.g., for styles in the theme.
- A bare word, like `section`, is a master of the theme, which lays the slide
  out. `master=ClosingMaster` takes an imported component instead.
- `title=…` is the title of the slide in the table of contents, e.g., a
  shorter one.
- `lang=…` sets the language of the slide, e.g., for a quote.
- `fade=…` and `cut` set how the slide fades, see
  [Fades between slides](#fades-between-slides).
- `steps=…` sets the default behavior of the steps on the slide, see
  [Steps](steps.md#behaviors).
- `from`, `after`, `to`, and `before` limit the steps shown when going
  through the slide, see [Steps](steps.md#ranges-of-steps).

`::slide` takes the same attributes, e.g., `::slide{#questions
master=ClosingMaster title=Questions}`.

A brace block at the end of a heading is read as attributes, rather than an
MDX expression, as long as it only has ids, classes, `key=value` pairs, and
bare words. So `## Total {count}` uses the master `count`, while
`## Total {String(count)}` shows the value of `count`.

## Fades between slides

By default, slides cut to the next one, and steps fade in. Themes can change
this. Slides can override it with these attributes, in milliseconds:

| Attribute      | Duration of                              |
| -------------- | ---------------------------------------- |
| `fade=…`       | all fades of the slide, and of its steps |
| `fadeIn=…`     | fading into the slide                    |
| `fadeOut=…`    | fading out of the slide                  |
| `fadeBefore=…` | fading to or from the slide before it    |
| `fadeAfter=…`  | fading to or from the slide after it     |

`cut` stands for a fade of 0 ms. It doesn't affect the steps of the slide.

| Attribute    | Same as            |
| ------------ | ------------------ |
| `cut`        | 0 ms on every side |
| `cut=in`     | `fadeIn=0`         |
| `cut=out`    | `fadeOut=0`        |
| `cut=before` | `fadeBefore=0`     |
| `cut=after`  | `fadeAfter=0`      |

Sides can be combined, e.g., `{cut="in after"}`.

For example:

```mdx
### Results {fadeIn=600}

### Full-screen photo {cut}
```

### When two slides disagree

Going forward, the deck leaves a slide through its `out` and `after` sides,
and enters the next one through its `in` and `before` sides. Going back, it
uses `before` and `after` the other way around.

Both slides may set a duration for these sides. The most specific one wins:

1. a side of the slide, like `fadeIn` or `cut=in`,
2. the whole slide, like `fade` or `cut`,
3. a side of its master,
4. the whole master.

If two durations are equally specific, the shorter one wins. So a cut wins
over a fade at the same level.

A slide's own `cut`, even `cut=false`, replaces the cut of its master.

## Spare slides and divisions

Some slides are only shown if needed, e.g., to answer questions. `{spare}`
marks a slide as spare, and on a section, all slides in it, unless they have
`{spare=false}`. Going through the deck skips spare slides, but they can be
chosen from the table of contents, the overview, or with G. The arrow keys
then go on to the spare slides after it, and going back returns to the slide
before it.

`{noslide}` on a heading groups the slides after it in the table of contents
and the overview without a slide of its own, e.g.:

```mdx
## Backup {noslide spare}

### Detailed measurements
```

## Languages

`lang` in the frontmatter sets the language of the deck, and `{lang=…}` that
of a slide, which affects, e.g., hyphenation and screen readers.

The user interface, like menus and tooltips, is shown in the language of the
deck, if available, and viewers can switch to English. It's available in
English, Hungarian, German, and French. `uiLanguages` offers further
languages to switch to, or adds a language from a file of messages:

```yaml
uiLanguages: [de, fr, { pt: ./locales/pt.json }]
```

The files are like those in
[`packages/core/src/i18n/locales`](../../packages/core/src/i18n/locales).
