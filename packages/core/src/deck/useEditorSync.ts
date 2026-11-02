import { useEffect, useEffectEvent, useRef } from 'react';

import { getDevChannel } from '../host/devChannel.ts';

/** The version of the messages, which both sides ignore if it isn't theirs. */
const VERSION = 1;

interface GoToSlide {
  version?: unknown;
  slideId?: unknown;
  slideIndex?: unknown;
}

/** Returns where the slide with the `source` prop `source` starts, if known. */
function parseSource(source: string | undefined) {
  const [line, column] = (source ?? '').split(':').map(Number);
  return line === undefined || column === undefined || Number.isNaN(column)
    ? undefined
    : { line, column };
}

/**
 * Keeps an editor showing the source of the deck and the slide of the deck
 * together, if the dev server of the page connects them: tells the editor
 * where the slides start in the source and which one is shown, and goes to the
 * slides that it asks for, keeping their steps.
 */
export function useEditorSync(
  slideIds: readonly (string | undefined)[],
  slideSources: readonly (string | undefined)[],
  slideIndex: number,
  goToSlide: (slideIndex: number) => void,
): void {
  const table = JSON.stringify(
    slideIds.map((id, index) => ({
      id,
      start: parseSource(slideSources[index]),
    })),
  );
  useEffect(() => {
    getDevChannel()?.send('slides', {
      version: VERSION,
      slides: JSON.parse(table) as unknown,
    });
  }, [table]);

  // The slide that the editor asked for, which it doesn't need to be told of.
  const requestedRef = useRef<number>(undefined);
  useEffect(() => {
    if (requestedRef.current !== slideIndex) {
      getDevChannel()?.send('location', { version: VERSION, slideIndex });
    }
    requestedRef.current = undefined;
  }, [slideIndex]);

  const onGoToSlide = useEffectEvent(
    ({ version, slideId, slideIndex: index }: GoToSlide) => {
      if (version !== VERSION) {
        return;
      }
      // By its id, since the slides before it may have changed in the meantime.
      const byId = typeof slideId === 'string' ? slideIds.indexOf(slideId) : -1;
      const target =
        byId >= 0 ? byId : typeof index === 'number' ? index : undefined;
      if (
        target !== undefined &&
        target !== slideIndex &&
        target >= 0 &&
        target < slideIds.length
      ) {
        requestedRef.current = target;
        goToSlide(target);
      }
    },
  );
  useEffect(
    () =>
      getDevChannel()?.on('goToSlide', (data) => {
        onGoToSlide(data as GoToSlide);
      }),
    [],
  );
}
