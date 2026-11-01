---
sidebar_position: 3
description: Reveal content step by step and control how it appears.
---

# Steps

Steps reveal the content of a slide bit by bit. Going forward shows the next
step, until the slide is done and the next slide comes.

## Revealing content

`:step` in a list item or a paragraph shows it in a new step:

```mdx
- Shown up front
- :step Shown in the first step
- and this one along with it
- :step Shown in the second step

:step This paragraph is shown in the third step.
```

Content without `:step` goes with the latest step before it on its level. It
appears and goes away with that step, and looks like it. If there is no such step,
it's shown up front. This holds for list items, paragraphs, images, and elements
like columns.

So `:step` marks where a new step begins. Everything after it goes along until the
next `:step`. Steps nested in it come after it.

`with` shows a step together with another one:

- `with=previous` uses the step right before it.
- `with=content` uses the latest step that shows content, and skips overlays like
  callouts. Content without `:step` works this way, too.
- `with=initial`, or just `initial`, shows it as soon as its parent is, even after
  other steps. The parent is the step it's nested in, or the slide.
- `with=parent` doesn't make a step. The content is simply part of its parent, and
  steps inside it are nested directly in the parent. `step=false` means the same.
  Content without `:step` after it is also part of the parent, until the next step.

A step placed like this looks like the step it's shown with. A behavior gives it
its own look, e.g., `:step{reveal with=previous}`.

If there is no step to be shown with, `with` creates one, shown up front. It goes
past at the next step on its level. Content without `:step` never creates a step.

A level has only one step shown up front. A later `with=initial` joins it, even if
it's an overlay like a callout:

```mdx
- :step{initial} Shown up front:callout[Goes away with the next item]
- This goes with it, too
- :step{with=parent} This stays
- :step The next item
```

`split`, `overlay`, and `fade` configure a step, but don't make one. On content
that is part of a step, they apply along with those of the step. For example,
`![Results](./results.png){split=none}` needs no page of its own, while its step
still does.

Images take `step` and the other attributes of `:step` in their attributes,
e.g., `![Results](./results.png){step}`. Other elements take them the same
way, e.g., `:::column{step}`.

## Steps around content

`:step[…]` reveals part of a paragraph in a step of its own, and the rest of
the paragraph follows the steps as usual:

```mdx
Markdown is :step[easy to write], :step[easy to diff], and :step[easy to keep].
```

`::step[…]` on a line of its own is a paragraph in a new step, like a
paragraph with `:step`. `:::step` reveals several blocks together:

```mdx
:::step
A paragraph and

- a list

appear together.
:::
```

They render a `span`, a paragraph, and a `div`. `component=…` renders
another element instead, e.g., `:::step{component=section}`. They take the
other attributes of `:step`, too, e.g., `:step[later]{group=con}`.

Content inside `:::step` follows its step, and `:step` inside it makes
nested steps, as in a list item.

## Nested steps

Steps in a nested list are steps of their list item, and come right after
it:

```mdx
- :step Parsing
  - :step Tokens
  - :step Syntax tree
- :step Rendering
```

The step tree (Shift+T) shows how the steps of the current slide nest, and
the address shows the current step, e.g., `#parsing&step=1.2` for Syntax
tree.

A paragraph or image in a list item is part of its item. One with `:step` is a
nested step of the item. Steps in content without `:step` are nested in the step
that content goes with, or are steps of the slide if there is none.

Steps nested in a step shown up front have a 0 in the address, e.g., `step=0.1`.
For a step shown as soon as step 1, it's `step=1.0.1`. The step tree shows them
below the step they are nested in. For the slide, that's the first entry. Steps
shown up front are marked in the tree, and choosing them goes to the step around
them.

## Groups

Steps with the same `group` are shown together, wherever they are on the
slide:

```mdx
- :step{group=pro} Markdown is easy to write
- :step{group=con} but layout control is limited
- :step{group=pro} Diffs are readable
- :step{group=con} but figures still need components
```

Here, both pros are shown in the first step, and both cons in the second one.

The first element of a group decides where it's placed and how it looks:

- The group is nested wherever that element is. An element outside of a step can
  still join a group inside it, and then goes away with it.
- Other elements look like the first one, unless they have a behavior of their own.
- With `with=parent`, the group is just a name for the parent of that element.

A step with a name, like `:step{#parse}`, is in the group of that name, unless it
has a `group`. The address can refer to steps by their group, e.g.,
`#intro&step=parse`. This keeps working when steps are added before it.

`:step{title=…}` names a step in the step tree, instead of its text.

## Placing steps elsewhere

A step is usually placed where it is in the text, after the steps before it.
Two attributes place it elsewhere:

- `in=parse` nests the step in the group `parse`, as if it was inside it,
  e.g., an explanation of a step written further down.
- `after=parse` places the step right after the group `parse`, at the same
  level.

```mdx
- :step{group=parse} Parsing turns Markdown into a syntax tree
- :step{group=render} Rendering turns the tree into React elements

:step{in=parse} This is shown in a step nested in parsing,
before rendering.
```

## Behaviors

A step can do more than appear. Its behavior sets how it looks before,
during, and after its turn:

| Behavior  | Before    | During | After     | Once its parent is past |
| --------- | --------- | ------ | --------- | ----------------------- |
| `reveal`  | hidden    | shown  | shown     | shown                   |
| `dim`     | hidden    | shown  | dimmed    | dimmed                  |
| `preview` | dimmed    | shown  | shown     | shown                   |
| `focus`   | dimmed    | shown  | dimmed    | dimmed                  |
| `only`    | hidden    | shown  | hidden    | hidden                  |
| `scoped`  | hidden    | shown  | shown     | hidden                  |
| `insert`  | collapsed | shown  | shown     | shown                   |
| `expand`  | collapsed | shown  | shown     | collapsed               |
| `swap`    | collapsed | shown  | collapsed | collapsed               |
| `always`  | shown     | shown  | shown     | shown                   |

`reveal` is the default. A step's turn lasts while its nested steps are
shown, too. `always` keeps a step shown, e.g., if it's only there for the steps
nested in it.

Hidden steps keep their space, so that the slide doesn't move when they
appear. Collapsed steps take no space instead:

- `insert` makes room for a step when it's shown, pushing the content after
  it, e.g., a line inserted into a listing.
- `expand` also collapses a step again once the step it's nested in is past. Details
  expand under their item one by one, and fold away when the next item comes, so
  that a long outline fits on a slide:

```mdx
- :step Parsing
  - :step{expand} Tokens
  - :step{expand} Syntax tree
- :step Rendering
  - :step{expand} React elements
```

- `swap` shows steps one after another in the same place, e.g., versions of
  a figure, where each one replaces the one before:

```mdx
:step{swap initial} ![First draft](./draft-1.svg)

:step{swap} ![Second draft](./draft-2.svg)

:step{swap} ![Final version](./final.svg)
```

`initial` shows the first one up front, until the second one replaces
it. Steps nested in a collapsed step are collapsed with it.

The behavior is a bare word on the step, e.g., `:step{only}`, or `behavior=only`.
`{steps=dim}` on a slide sets the default behavior of its steps. For example, it
can dim past steps, so that the audience follows the current one:

```mdx
### Step by step {steps=dim}

- :step First, this
- :step then this
- :step{focus} and this one dimmed before and after
```

Content without a step of its own takes no default behavior, and looks like the
step it is part of. Themes can change how behaviors look and add new ones.

## Fades

Steps fade in and out, for as long as the theme says. Steps take the same
attributes as [slides](decks.md#fades-between-slides):

```mdx
- :step{fade=400} Fades in slowly
- :step{cut} Appears at once
```

A step change crosses the same sides as a slide change. Going forward:

- the steps whose turn ends cross their `out` and `after` sides,
- the steps whose turn starts cross their `in` and `before` sides.

Nested steps and every step of a group count. As for slides, only the most
specific durations and cuts count. Of those, a cut wins, or else the longest
duration, so that every step gets at least the time it asks for.

If no step sets a duration, `fade` on the slide decides, then its master's,
then the theme's. A slide's `cut` and side fades don't affect its steps.

## Ranges of steps

`from`, `after`, `to`, and `before` on a slide limit the steps shown when
going through it, e.g., to show only part of a slide, and the rest in a
recap:

```mdx
### Overview {after=1 to=parse}
```

Their values are step numbers, like `1` or `2.1`, or names of groups. `from`
and `to` include the step they refer to, `after` and `before` don't. The
skipped steps can still be chosen from the step tree.

## Splitting into pages

A slide with steps becomes as few pages as possible when it's split into pages,
e.g., for [printing](../presenting.md#printing). Everything shown at some step is
still on some page. A page shows the slide at a step. A step becomes a page just
before something is hidden, collapsed, or covered, and at the end of the slide:

- Steps that stay shown, like `reveal`, make a single page of the last step.
- `only`, `swap`, and `expand` make a page of each step before it goes away.
- Dimmed content counts as shown, so `dim` and `focus` don't make pages of
  their own.

The step tree (Shift+T) marks the steps that become pages.

`split` on a step changes how it asks for pages. A mode says whether its
content needs a page:

- `split=auto`, the default, shows its content on some page.
- `split=none` needs no page for it, e.g., for a joke shown with `only`.
  Pages made for other content may still show it.
- `split=each` needs a page of each of its steps, like `<Steps>`.

A page shows a whole step, so everything shown at that step decides together:

- One element that asks for a page is enough.
- Content without a mode goes along with the rest. With `:step{only split=none}`
  followed by a paragraph, neither gets a page.
- A step without a mode takes the mode of the step it's nested in, or of the slide,
  unless it's shown with another step.

Points make pages at the step, in addition to the mode:

- `split=before` makes a page just before the step is shown, e.g., of what
  the step covers.
- `split=initial`, or a bare `split`, makes a page when the step is shown,
  before the steps nested in it.
- `split=last` makes a page at the end of its turn, after the steps nested in
  it.

A step can have a mode and several points, e.g., `split="none last"`. Steps
of a group make the pages that any of them asks for.

Content that floats over other content, like
[callouts](../plugins/elements/callouts.md), is an overlay. The content it may cover
gets a page before overlays first cover it, e.g., a figure before the callouts
pointing at it. Content shown along with an overlay doesn't, since the overlay
likely doesn't cover it.

`:step{overlay}` makes a step an overlay, and `overlay=false` makes a callout an
ordinary step. Content that isn't a step, like a callout with `with=parent`, doesn't
count. The step tree marks overlays, too.

`split` on a slide sets the mode of its steps, e.g., `{split=none}` for a single
page of the last step. It can also list the steps to make pages of, like the
[ranges of steps](#ranges-of-steps), e.g., `{split="1, parse"}`. Use `0` for the
slide before its steps. The steps then make no other pages, unless the slide also
has a mode or the steps ask for them. Only the steps in the range of the slide
become pages.

## Steps in JSX

JSX on a slide can use the components of `@seminar/core`:

- `<Step>` takes the same props as `:step`, e.g., `<Step group="parse" only>`.
- `<Steps count={3}>` takes several steps, and passes the current one to a function
  as its children, e.g., to highlight parts of a figure one after another. Its
  content may change in each step, so it makes a page of each step. Use
  `split="none"` if it only highlights.
