import { isValidElement, type ReactNode } from 'react';

/** An entry of the table of contents of a deck. */
export interface TocEntry {
  /** The id of the slide, or its zero-based index in the deck. */
  slide: string | number;
  /**
   * The title of the entry. Defaults to the `title` prop of the slide, or to
   * `Slide <n>` for slides without a title.
   */
  title?: ReactNode;
  /** Entries nested in this one, e.g., the slides of a section. */
  children?: TocEntry[] | undefined;
}

/** A {@link TocEntry} with its slide and title resolved. */
export interface ResolvedTocEntry {
  slideIndex: number;
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
 * entries nested in them.
 *
 * @param slideIds The ids of the slides of the deck, by index.
 */
export function resolveToc(
  entries: readonly TocEntry[],
  slides: readonly ReactNode[],
  slideIds: readonly (string | undefined)[],
): ResolvedTocEntry[] {
  return entries.flatMap(({ slide, title, children = [] }) => {
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
        title:
          title ??
          getSlideTitle(slides[slideIndex]) ??
          `Slide ${String(slideIndex + 1)}`,
        children: resolveToc(children, slides, slideIds),
      },
    ];
  });
}

/**
 * Returns the slide index of the entry of the current slide: the last entry
 * (in document order) at or before `slideIndex`, or `undefined` if the slide
 * comes before every entry.
 */
export function findCurrentEntry(
  entries: readonly ResolvedTocEntry[],
  slideIndex: number,
): number | undefined {
  let current: number | undefined;
  const visit = (nested: readonly ResolvedTocEntry[]) => {
    for (const entry of nested) {
      if (
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
