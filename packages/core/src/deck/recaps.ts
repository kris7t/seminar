import {
  cloneElement,
  isValidElement,
  type Children,
  type ReactElement,
} from 'react';

import type { SlideProps } from '../slide/Slide.tsx';

type SlideNode = ReturnType<typeof Children.toArray>[number];

function propsOf(slide: SlideNode | undefined): SlideProps | undefined {
  return isValidElement<SlideProps>(slide) ? slide.props : undefined;
}

/** Returns the slides that the aliases of the slides refer to. */
export function getAliases(slides: readonly SlideNode[]): Map<string, number> {
  const aliases = new Map<string, number>();
  for (const [index, slide] of slides.entries()) {
    if (isValidElement<{ aliases?: unknown }>(slide)) {
      const { aliases: slideAliases } = slide.props;
      if (Array.isArray(slideAliases)) {
        for (const alias of slideAliases) {
          if (typeof alias === 'string' && !aliases.has(alias)) {
            aliases.set(alias, index);
          }
        }
      }
    }
  }
  return aliases;
}

/** The slides of a deck with their recaps resolved. */
export interface ResolvedRecaps {
  slides: SlideNode[];
  /** The slide that each slide recaps, if it's a recap. */
  recapOf: (number | undefined)[];
}

/**
 * Replaces the recaps among `slides`, i.e., slides with a `recap` prop, with
 * the slides they recap, which they refer to by id. A recap of a recap recaps
 * the slide recapped by the latter. Recaps of missing slides are kept as they
 * are, i.e., empty slides.
 *
 * Recaps keep their own `id`, `spare`, and range of steps, while the rest of
 * the props, like the master and the title, come from the recapped slide.
 * Recaps without an `id` get one derived from the id of the recapped slide,
 * e.g., `intro-recap`.
 *
 * Without `from` or `after`, a recap continues where the previous showing of
 * the slide, i.e., the slide itself or a previous recap of it, ended:
 * `to=P` there becomes `after=P`, and `before=P` becomes `from=P`, and if it
 * showed all steps, the recap only shows the last step.
 *
 * @param aliases Further ids of the slides, by the index of the slide.
 */
export function resolveRecaps(
  slides: readonly SlideNode[],
  slideIds: readonly (string | undefined)[],
  aliases: ReadonlyMap<string, number>,
): ResolvedRecaps {
  // The ids of the slides, including the ids derived for earlier recaps.
  const ids = [...slideIds];
  const findSlide = (id: string) => {
    const index = ids.indexOf(id);
    return index >= 0 ? index : aliases.get(id);
  };
  /** Finds the slide that the slide at `index` recaps, following recaps. */
  const findOriginal = (index: number): number | undefined => {
    const visited = new Set<number>();
    let current = index;
    for (;;) {
      const recap = propsOf(slides[current])?.recap;
      if (recap === undefined) {
        return current === index ? undefined : current;
      }
      visited.add(current);
      const target = findSlide(recap);
      if (target === undefined || visited.has(target)) {
        console.warn(`Can't find the slide \`${recap}\` to recap.`);
        return undefined;
      }
      current = target;
    }
  };
  const usedIds = new Set(
    slideIds.filter((id): id is string => id !== undefined),
  );
  const deriveId = (base: string | undefined) => {
    if (base === undefined) {
      return undefined;
    }
    let id = `${base}-recap`;
    for (let n = 2; usedIds.has(id); n += 1) {
      id = `${base}-recap-${String(n)}`;
    }
    usedIds.add(id);
    return id;
  };
  // Where the previous showing of each slide ended.
  const ends = new Map<number, Pick<SlideProps, 'to' | 'before'>>();
  const recapOf: (number | undefined)[] = [];
  const resolved = slides.map((slide, index) => {
    const props = propsOf(slide);
    const original = findOriginal(index);
    recapOf.push(original);
    if (props === undefined || original === undefined) {
      if (props !== undefined && props.recap === undefined) {
        ends.set(index, { to: props.to, before: props.before });
      }
      return slide;
    }
    const { id, spare, from, after, to, before, fromLast } = props;
    const range: Pick<SlideProps, 'from' | 'after' | 'fromLast'> = {
      from,
      after,
      fromLast,
    };
    const previous = ends.get(original);
    if (
      from === undefined &&
      after === undefined &&
      fromLast !== true &&
      previous !== undefined
    ) {
      if (previous.to !== undefined) {
        range.after = previous.to;
      } else if (previous.before !== undefined) {
        range.from = previous.before;
      } else {
        range.fromLast = true;
      }
    }
    ends.set(original, { to, before });
    const recapped = slides[original] as ReactElement<SlideProps>;
    const recapId = id ?? deriveId(slideIds[original]);
    ids[index] = recapId;
    // The recap is the recapped slide with some of its props replaced.
    // eslint-disable-next-line @eslint-react/no-clone-element
    return cloneElement(recapped, {
      key: (slide as ReactElement).key ?? `recap-${String(index)}`,
      id: recapId,
      aliases: undefined,
      spare,
      ...range,
      to,
      before,
      recap: undefined,
      recapOf: original,
    });
  });
  return { slides: resolved, recapOf };
}
