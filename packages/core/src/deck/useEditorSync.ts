import {
  Children,
  isValidElement,
  useEffect,
  useEffectEvent,
  useRef,
  type ReactNode,
} from 'react';

import { getDevChannel } from '../host/devChannel.ts';
import type { SourceRange } from '../host/sourceRanges.ts';
import type { StepPath } from '../steps/StepNode.ts';
import type { StepStore } from '../steps/StepStore.ts';
import type { StepTreeEntry } from '../steps/stepTree.ts';
import { phaseOf } from '../sidebar/StepTree.tsx';
import { findCurrentEntry, type ResolvedTocEntry } from './tableOfContents.ts';

/** The version of the messages, which both sides ignore if it isn't theirs. */
const VERSION = 1;

interface GoToSlide {
  version?: unknown;
  slideId?: unknown;
  slideIndex?: unknown;
}

interface GoToStep {
  version?: unknown;
  slideIndex?: unknown;
  path?: unknown;
}

/** Returns the text among `node`, leaving out what only components render. */
function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  return isValidElement<{ children?: ReactNode }>(node)
    ? textOf(node.props.children)
    : Array.isArray(node)
      ? // eslint-disable-next-line @eslint-react/no-children-to-array
        Children.toArray(node as ReactNode[])
          .map(textOf)
          .join('')
      : '';
}

/** What the table of contents tells about slides. */
interface SlideMarks {
  spares: readonly boolean[];
  recapOf: readonly (number | undefined)[];
  hasSteps: readonly boolean[];
  hasState: readonly boolean[];
  stateChanged: readonly boolean[];
}

/** Whether the entry is spare, like in the table of contents of the deck. */
function isSpareEntry(
  { hasSlide, slideIndex, children }: ResolvedTocEntry,
  spares: readonly boolean[],
): boolean {
  return hasSlide
    ? spares[slideIndex] === true
    : children.every((child) => isSpareEntry(child, spares));
}

function describeContents(
  entries: readonly ResolvedTocEntry[],
  marks: SlideMarks,
): unknown[] {
  return entries.map((entry) => {
    const { title, standIn, slideIndex, hasSlide, children } = entry;
    const recapped = hasSlide ? marks.recapOf[slideIndex] : undefined;
    const firstRecap =
      hasSlide && recapped === undefined
        ? marks.recapOf.indexOf(slideIndex)
        : -1;
    return {
      title: standIn === true ? '' : textOf(title).trim(),
      slideIndex,
      hasSlide,
      spare: isSpareEntry(entry, marks.spares),
      recapOf: recapped,
      firstRecap: firstRecap < 0 ? undefined : firstRecap,
      steps: hasSlide && marks.hasSteps[slideIndex] === true,
      state: hasSlide && marks.hasState[slideIndex] === true,
      stateChanged: hasSlide && marks.stateChanged[slideIndex] === true,
      children: describeContents(children, marks),
    };
  });
}

function describeSteps(
  entries: readonly StepTreeEntry[],
  store: StepStore,
  pages: ReadonlySet<string>,
  current: StepPath,
): unknown[] {
  return entries.map(({ path, label, overlay, children }) => ({
    path,
    label,
    overlay,
    page: pages.has(path.join('.')),
    skipped: !store.isInRange(path),
    phase: phaseOf(path, current),
    children: describeSteps(children, store, pages, current),
  }));
}

function isStepPath(path: unknown): path is StepPath {
  return Array.isArray(path) && path.every((step) => typeof step === 'number');
}

/** What {@link useEditorSync} tells about the deck, and how it moves. */
export interface EditorSyncOptions extends SlideMarks {
  slideIds: readonly (string | undefined)[];
  /** Where the slides are in the source of the deck, if known. */
  slideSources: readonly (SourceRange | undefined)[];
  slideIndex: number;
  toc: readonly ResolvedTocEntry[];
  /** The steps of the current slide. */
  stepStore: StepStore;
  /** Goes to a slide, keeping its steps. */
  goToSlide: (slideIndex: number) => void;
  /** Resets the state of a slide. */
  resetSlide: (slideIndex: number) => void;
}

/**
 * Keeps an editor showing the source of the deck and the slide of the deck
 * together, if the dev server of the page connects them: tells the editor
 * where the slides start in the source, which one is shown, the table of
 * contents, and the steps of the slide, and goes to the slides and steps that
 * it or another page of the deck asks for.
 */
export function useEditorSync({
  slideIds,
  slideSources,
  slideIndex,
  toc,
  stepStore,
  goToSlide,
  resetSlide,
  ...marks
}: EditorSyncOptions): void {
  const table = JSON.stringify(
    slideIds.map((id, index) => ({
      id,
      start: slideSources[index]?.start,
    })),
  );
  useEffect(() => {
    getDevChannel()?.send('slides', {
      version: VERSION,
      slides: JSON.parse(table) as unknown,
    });
  }, [table]);

  const contents = JSON.stringify({
    version: VERSION,
    current: findCurrentEntry(toc, slideIndex),
    entries: describeContents(toc, marks),
  });
  useEffect(() => {
    getDevChannel()?.send('contents', JSON.parse(contents));
  }, [contents]);

  // What the editor last heard of the steps, which change more often than what
  // it shows, e.g., while the slide renders.
  const stepsRef = useRef<string>(undefined);
  useEffect(() => {
    const channel = getDevChannel();
    if (channel === undefined) {
      return undefined;
    }
    const send = () => {
      const current = stepStore.getPath();
      const pages = new Set(
        stepStore.getSplitPaths().map((path) => path.join('.')),
      );
      const steps = JSON.stringify({
        version: VERSION,
        slideIndex,
        current,
        startPhase: phaseOf([], current),
        startPage: pages.has(''),
        entries: describeSteps(stepStore.getTree(), stepStore, pages, current),
      });
      if (steps !== stepsRef.current) {
        stepsRef.current = steps;
        channel.send('steps', JSON.parse(steps));
      }
    };
    send();
    return stepStore.subscribe(send);
  }, [stepStore, slideIndex]);

  // The slide that was asked for, which there's no need to tell about.
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
  const onGoToStep = useEffectEvent(
    ({ version, slideIndex: index, path }: GoToStep) => {
      if (version === VERSION && index === slideIndex && isStepPath(path)) {
        stepStore.reset(path);
      }
    },
  );
  const onResetSlide = useEffectEvent(
    ({ version, slideIndex: index }: GoToSlide) => {
      if (version === VERSION && typeof index === 'number') {
        resetSlide(index);
      }
    },
  );
  useEffect(() => {
    const channel = getDevChannel();
    if (channel === undefined) {
      return undefined;
    }
    const stop = [
      channel.on('goToSlide', (data) => {
        onGoToSlide(data as GoToSlide);
      }),
      // Where another page of the deck went.
      channel.on('location', (data) => {
        onGoToSlide(data as GoToSlide);
      }),
      channel.on('goToStep', (data) => {
        onGoToStep(data as GoToStep);
      }),
      channel.on('resetSlide', (data) => {
        onResetSlide(data as GoToSlide);
      }),
    ];
    return () => {
      for (const listener of stop) {
        listener();
      }
    };
  }, []);
}
