# Recaps and includes

## Recaps

A recap shows a slide again later in the deck, e.g., to come back to an
overview after a detour:

```mdx
### Overview {#overview to=1}

- :step Parsing
- :step Rendering

### Parsing in detail

…

::recap[#overview]
```

The recap continues the steps of the slide where its previous showing ended,
so here it starts with Rendering. A recap can have its own range of steps,
e.g., `::recap[#overview]{to=2}`, its own id, its title in the table of
contents with `title=`, and `spare`. Everything else, like the master and the
classes, comes from the slide it recaps.

## Includes

`::include` shows slides of another deck, e.g., a shared introduction:

```mdx
::include[./shared/intro.deck.mdx#motivation]
```

- `::include[./other.deck.mdx#id]` includes the slide with the id `id`, or a
  whole section with its slides.
- `::include[./other.deck.mdx]` includes the whole deck.
- `::include[./other.deck.mdx]{from=a to=b}` includes the slides from `a` to
  `b`. Like for steps, `from` and `to` include the slides they name, while
  `after` and `before` don't.

The path is resolved like an import, so it can be relative to the deck or in
a package. Only the included slides end up in the built deck.

Included slides keep their content, master, and classes, while the directive
can set their id, `title`, `spare`, and range of steps. A slide is only
included once: including it again, e.g., in an overlapping range, recaps it.
`copy` includes it as a new slide instead, with steps of its own.
