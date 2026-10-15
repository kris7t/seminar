import { isValidElement, type ReactNode } from 'react';

/** An entry of the table of contents of a deck. */
export interface TocEntry {
  /**
   * The id of the slide, or its zero-based index in the deck. Entries without
   * a slide only group their nested entries, e.g., a section without a section
   * slide, and go to the slide of their first nested entry.
   */
  slide?: string | number | undefined;
  /**
   * The title of the entry. Defaults to the `title` prop of the slide, or to
   * `Slide <n>` for slides without a title. Required for entries without a
   * slide.
   */
  title?: ReactNode;
  /** Entries nested in this one, e.g., the slides of a section. */
  children?: TocEntry[] | undefined;
}

/** A {@link TocEntry} with its slide and title resolved. */
export interface ResolvedTocEntry {
  /**
   * The slide of the entry, or of its first nested entry if it has no slide of
   * its own.
   */
  slideIndex: number;
  /** Whether the entry has a slide of its own. */
  hasSlide: boolean;
  title: ReactNode;
  children: ResolvedTocEntry[];
}

function getSlideTitle(slide: ReactNode): ReactNode {
  return isValidElement<{ title?: ReactNode }>(slide)
    ? slide.props.title
    : undefined;
}

/**
 * Resolves the slides and titles of `entries` against the slides of a deck.
 * Entries that refer to slides that don't exist are left out, along with the
 * entries nested in them, and so are entries without a slide that have no
 * nested entries left.
 *
 * @param slideIds The ids of the slides of the deck, by index.
 */
export function resolveToc(
  entries: readonly TocEntry[],
  slides: readonly ReactNode[],
  slideIds: readonly (string | undefined)[],
): ResolvedTocEntry[] {
  return entries.flatMap(
    ({ slide, title, children = [] }): ResolvedTocEntry[] => {
      if (slide === undefined) {
        const resolved = resolveToc(children, slides, slideIds);
        const first = resolved[0];
        return first === undefined
          ? []
          : [
              {
                slideIndex: first.slideIndex,
                hasSlide: false,
                title: title ?? 'Untitled',
                children: resolved,
              },
            ];
      }
      const slideIndex =
        typeof slide === 'number' ? slide : slideIds.indexOf(slide);
      if (!Number.isInteger(slideIndex) || slideIndex < 0) {
        return [];
      }
      if (slideIndex >= slides.length) {
        return [];
      }
      return [
        {
          slideIndex,
          hasSlide: true,
          title:
            title ??
            getSlideTitle(slides[slideIndex]) ??
            `Slide ${String(slideIndex + 1)}`,
          children: resolveToc(children, slides, slideIds),
        },
      ];
    },
  );
}

/**
 * Returns the slide index of the entry of the current slide: the last entry
 * with a slide (in document order) at or before `slideIndex`, or `undefined`
 * if the slide comes before every entry.
 */
export function findCurrentEntry(
  entries: readonly ResolvedTocEntry[],
  slideIndex: number,
): number | undefined {
  let current: number | undefined;
  const visit = (nested: readonly ResolvedTocEntry[]) => {
    for (const entry of nested) {
      if (
        entry.hasSlide &&
        entry.slideIndex <= slideIndex &&
        (current === undefined || entry.slideIndex >= current)
      ) {
        current = entry.slideIndex;
      }
      visit(entry.children);
    }
  };
  visit(entries);
  return current;
}
