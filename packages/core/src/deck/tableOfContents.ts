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
  /**
   * Whether the title stands in for a slide without one, e.g., `Slide 3`,
   * rather than being the title of the entry or of its slide.
   */
  standIn?: boolean;
  children: ResolvedTocEntry[];
}

/** Titles of entries without one, e.g., in the language of the interface. */
export interface StandInTitles {
  /** The title of entries without a slide or a title. */
  untitled: ReactNode;
  /** The title of a slide without one, by its zero-based index. */
  slide: (slideIndex: number) => ReactNode;
}

const ENGLISH_STAND_INS: StandInTitles = {
  untitled: 'Untitled',
  slide: (slideIndex) => `Slide ${String(slideIndex + 1)}`,
};

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
 * @param standIns The titles of entries without one. Defaults to English.
 */
export function resolveToc(
  entries: readonly TocEntry[],
  slides: readonly ReactNode[],
  slideIds: readonly (string | undefined)[],
  standIns: StandInTitles = ENGLISH_STAND_INS,
): ResolvedTocEntry[] {
  return entries.flatMap(
    ({ slide, title, children = [] }): ResolvedTocEntry[] => {
      if (slide === undefined) {
        const resolved = resolveToc(children, slides, slideIds, standIns);
        const first = resolved[0];
        return first === undefined
          ? []
          : [
              {
                slideIndex: first.slideIndex,
                hasSlide: false,
                title: title ?? standIns.untitled,
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
      const own = title ?? getSlideTitle(slides[slideIndex]);
      return [
        {
          slideIndex,
          hasSlide: true,
          title: own ?? standIns.slide(slideIndex),
          ...(own === undefined ? { standIn: true } : {}),
          children: resolveToc(children, slides, slideIds, standIns),
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

/**
 * Returns the title of each slide: the title of its entry in the table of
 * contents, or its `title` prop if it has no entry, by index, or `undefined`
 * for slides without a title.
 */
export function slideTitles(
  entries: readonly ResolvedTocEntry[],
  slides: readonly ReactNode[],
): ReactNode[] {
  const titles: ReactNode[] = slides.map(getSlideTitle);
  const found = new Set<number>();
  const visit = (nested: readonly ResolvedTocEntry[]) => {
    for (const { slideIndex, hasSlide, title, standIn, children } of nested) {
      // The first entry of a slide wins, as in a hand-written table of
      // contents with several entries for a slide.
      if (hasSlide && !found.has(slideIndex)) {
        found.add(slideIndex);
        // Not the stand-in title of slides without one.
        titles[slideIndex] = standIn === true ? undefined : title;
      }
      visit(children);
    }
  };
  visit(entries);
  return titles;
}
