import type { Theme } from '@mui/material/styles';
import { createContext, useId, type Context, type CSSProperties } from 'react';
import { flushSync } from 'react-dom';

/** How the slide fades, e.g., from one step to another. */
export interface FadeTransition {
  /**
   * Duration in milliseconds, or 0 to change at once, without view
   * transitions. Defaults to 150, short enough not to hold up the talk.
   */
  duration?: number | undefined;
  /** CSS easing function. Defaults to `ease`, like view transitions. */
  easing?: string | undefined;
}

declare module '@mui/material/styles' {
  interface Theme {
    /** How the slide fades from one step to another. */
    stepTransition?: FadeTransition | undefined;
    /**
     * How one slide fades into another, if the one shown fades out, and the
     * one coming fades in, as their `transition`, or that of their master,
     * says.
     */
    slideTransition?: FadeTransition | undefined;
  }

  interface ThemeOptions {
    stepTransition?: FadeTransition | undefined;
    slideTransition?: FadeTransition | undefined;
  }
}

/** What changes in a transition: the step of a slide, or the slide. */
export type SlideTransitionKind = 'step' | 'slide';

export const DEFAULT_SLIDE_TRANSITIONS: Record<
  SlideTransitionKind,
  { duration: number; easing: string }
> = {
  step: {
    duration: 150,
    easing: 'ease',
  },
  slide: {
    duration: 0,
    easing: 'ease',
  },
};

/** Returns how the slide fades in a transition of `kind` in `theme`. */
export function getFadeTransition(
  theme: Theme,
  kind: SlideTransitionKind,
): { duration: number; easing: string } {
  const transition =
    kind === 'step' ? theme.stepTransition : theme.slideTransition;
  return {
    duration: transition?.duration ?? DEFAULT_SLIDE_TRANSITIONS[kind].duration,
    easing: transition?.easing ?? DEFAULT_SLIDE_TRANSITIONS[kind].easing,
  };
}

/**
 * Attribute of the element whose view transition is running, with its
 * {@link SlideTransitionKind}: the slide frame itself, if the browser supports view transitions scoped to an element, or
 * the root element of its document otherwise.
 */
export const TRANSITION_ATTRIBUTE = 'data-slider-transition';

/**
 * Custom property of the element whose view transition is running with its
 * duration, if it differs from that of the theme, e.g., for a slide.
 */
export const DURATION_PROPERTY = '--slider-fade-duration';

/**
 * Attribute of the slide frames that take part in a view transition of their
 * whole document, which are the only parts of the document that are animated.
 */
export const TRANSITION_FRAME_ATTRIBUTE = 'data-slider-transition-frame';

/**
 * Name of the view transition of slide frames in transitions of their whole
 * document.
 */
export const SLIDE_TRANSITION_NAME = 'slider-slide';

/**
 * Name of the view transition of the mirrored pointer, which keeps following
 * the mouse while the slide fades.
 */
export const POINTER_TRANSITION_NAME = 'slider-pointer';

/**
 * View transition class of elements that animate themselves, rather than
 * fading with the slide (see {@link useOwnAnimation}).
 */
export const OWN_ANIMATION_CLASS = 'slider-own-animation';

/**
 * Returns styles that keep an element out of the fade of the slide from one
 * step to another, but not from one slide to another, e.g., a marker that moves with a CSS transition when the
 * step changes, which would otherwise move under the fading snapshot of the
 * old slide. The element shows how it is at once, and its own animations
 * play out in full.
 *
 * The element doesn't fade in or out with the slide, so it should animate
 * appearing and disappearing itself, if it does. Its animations should
 * follow the steps, as the authoring guidelines describe. Browsers that
 * don't support view transition classes fade it with the slide.
 */
export function useOwnAnimation(): CSSProperties {
  // View transition names must be identifiers.
  const id = useId().replace(/[^\w-]/g, '');
  return {
    viewTransitionName: `slider-own-animation-${id}`,
    viewTransitionClass: OWN_ANIMATION_CLASS,
  };
}

/** A change of the slide or its steps, see {@link SlideTransitions.change}. */
export interface SlideChange {
  kind: SlideTransitionKind;
  /** How long the slide fades, in milliseconds, or 0 if it changes at once. */
  duration: number;
  /** Whether the change goes to a later slide or step. */
  forward: boolean;
  /** Index of the slide shown after the change. */
  slideIndex: number;
  /** The step shown after a change of `kind` `'step'`. */
  path?: readonly number[] | undefined;
  /**
   * Whether to show the change right away, without waiting for the slide to
   * settle, e.g., after a swipe, which already moved the slides.
   */
  immediate?: boolean | undefined;
  /**
   * Whether the views show the change, rather than still showing the slide
   * as it was while the changed slide settles, as
   * {@link SlideTransitions.getChange} reports it.
   */
  shown?: boolean | undefined;
  /**
   * Whether the change was cut short, e.g., because another change came
   * before it ended, as {@link SlideTransitions.getChange} reports it.
   */
  skipped?: boolean | undefined;
}

/** Safety net for update callbacks that the browser doesn't call. */
const UPDATE_TIMEOUT = 1000;

/**
 * How long a change waits for the slide to settle by default, in
 * milliseconds, see {@link SlideTransitions.hold}.
 */
export const SETTLE_DEADLINE = 150;

/**
 * The longest a change waits for the slide to settle, in milliseconds,
 * whatever the holds say. Browsers give up on view transitions whose update
 * takes a few seconds.
 */
const MAX_SETTLE_DEADLINE = 3000;

/** How often a change checks whether images and fonts have loaded. */
const SETTLE_POLL = 10;

/** An element that may support view transitions scoped to itself. */
interface ScopableElement extends HTMLElement {
  startViewTransition?: Document['startViewTransition'];
}

/** Starts a view transition of `frame`, or of its document. */
function startTransition(
  frame: ScopableElement,
  kind: SlideTransitionKind,
  duration: number | undefined,
  update: () => Promise<void>,
): { transition: ViewTransition; scope: HTMLElement } | undefined {
  const setDuration = (scope: HTMLElement) => {
    if (duration === undefined) {
      scope.style.removeProperty(DURATION_PROPERTY);
    } else {
      scope.style.setProperty(DURATION_PROPERTY, `${String(duration)}ms`);
    }
  };
  if (typeof frame.startViewTransition === 'function') {
    frame.setAttribute(TRANSITION_ATTRIBUTE, kind);
    setDuration(frame);
    return { transition: frame.startViewTransition(update), scope: frame };
  }
  const doc = frame.ownerDocument;
  if (typeof doc.startViewTransition !== 'function') {
    return undefined;
  }
  // Only the slide is animated, and the rest of the document stays live.
  doc.documentElement.setAttribute(TRANSITION_ATTRIBUTE, kind);
  setDuration(doc.documentElement);
  frame.setAttribute(TRANSITION_FRAME_ATTRIBUTE, '');
  return {
    transition: doc.startViewTransition(update),
    scope: doc.documentElement,
  };
}

function prefersReducedMotion(frame: HTMLElement): boolean {
  return (
    // Not every environment has media queries, e.g., jsdom.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    frame.ownerDocument.defaultView?.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ).matches ?? false
  );
}

/** Whether `frame` shows content that is still loading, e.g., images. */
function isLoading(frame: HTMLElement): boolean {
  const doc = frame.ownerDocument;
  // Not every environment loads fonts, e.g., jsdom.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (doc.fonts?.status === 'loading') {
    return true;
  }
  // Images that aren't rendered, e.g., in collapsed steps, may never load.
  return [...frame.querySelectorAll('img')].some(
    (image) => !image.complete && image.getClientRects().length > 0,
  );
}

/** Waits for the tasks queued so far, e.g., renders scheduled by React. */
function nextTask(frame: HTMLElement, delay = 0): Promise<void> {
  const view = frame.ownerDocument.defaultView ?? window;
  return new Promise((resolve) => {
    view.setTimeout(resolve, delay);
  });
}

/**
 * Calls `action` with the animations in `frame` that started at `start` of
 * the timeline of its document or later, e.g., CSS transitions set off by a
 * change, but not with endless ones, e.g., spinners.
 */
function forAnimationsSince(
  frame: HTMLElement,
  start: number,
  action: (animation: Animation) => void,
): void {
  // Not every environment has animations, e.g., jsdom.
  if (typeof frame.getAnimations !== 'function') {
    return;
  }
  for (const animation of frame.getAnimations({ subtree: true })) {
    const startTime = animation.startTime;
    const endTime = animation.effect?.getComputedTiming().endTime;
    if (
      (startTime === null || Number(startTime) >= start) &&
      Number.isFinite(Number(endTime))
    ) {
      try {
        action(animation);
      } catch {
        // E.g., an animation that was just canceled.
      }
    }
  }
}

/** A change waiting for the slide to settle before it's shown. */
interface Settling {
  readonly start: number;
  /** The deadlines of the holds that haven't been released yet. */
  readonly holds: Set<{ deadline: number }>;
  /**
   * The animations that the change set off, which are paused while the
   * views wait, so that they don't play out unseen.
   */
  readonly animations: Set<Animation>;
  /**
   * Shows the change, whether or not the slide has settled, and lets the
   * paused animations go on.
   */
  end: () => void;
}

/**
 * Fades the slides shown in some views, like the audience and the presenter
 * view, from one step to another with view transitions, at the same time in
 * every window.
 *
 * Fading snapshots of the whole slide, rather than each step on its own,
 * keeps nested steps from showing through while their parents fade, and
 * works with any change of the slide, e.g., by components that follow the
 * steps. Only view transitions scoped to the frame fade, since those of the
 * whole document cover what's painted over the slide, and some browsers
 * don't keep the elements that animate themselves live in them. Elsewhere,
 * the slide cuts, but {@link getChange} still tells the timing of the
 * change, so that components animate along.
 *
 * Changes that cut, rather than fade, use view transitions, too: the views
 * keep showing the slide as it was until the changed slide settles, e.g.,
 * its components are measured and its images are loaded, so that it doesn't
 * flash in an unfinished layout (see {@link hold}). The animations that the
 * change set off on the slide start over once it's shown.
 */
export class SlideTransitions {
  readonly #frames = new Set<HTMLElement>();
  /**
   * Frames that only keep showing what they showed until the change is
   * shown, see {@link register}.
   */
  readonly #holdOnly = new Set<HTMLElement>();
  /** The running transitions, and the elements they run on. */
  readonly #transitions = new Map<ViewTransition, HTMLElement>();
  readonly #listeners = new Set<() => void>();
  /** Applies the update of the last transition, if it hasn't been yet. */
  #pending: (() => void) | undefined;
  #change: SlideChange | undefined;
  readonly #changeListeners = new Set<() => void>();
  #settling: Settling | undefined;
  readonly #measureListeners = new Set<() => void>();
  /**
   * When the last change was rendered, on the timeline of the document of
   * each frame, so that its animations can be told apart.
   */
  #changeTimes = new Map<Document, number>();

  /**
   * Fades `frame`, an element that shows a slide, when steps change. The
   * frame must be the only element with a slide in its document that's
   * registered, except for `holdOnly` frames.
   *
   * @param options.holdOnly Whether the frame shows something else that
   *   follows the slide, e.g., the notes of the presenter view, which should
   *   keep showing what it showed until the change is shown, and then cut.
   *   Only browsers with transitions scoped to an element hold these, since
   *   transitions of the whole document hold all of it anyway.
   * @returns A function that stops fading the frame.
   */
  register(
    frame: HTMLElement,
    { holdOnly = false }: { holdOnly?: boolean } = {},
  ): () => void {
    this.#frames.add(frame);
    if (holdOnly) {
      this.#holdOnly.add(frame);
    }
    return () => {
      this.#frames.delete(frame);
      this.#holdOnly.delete(frame);
    };
  }

  /** Whether a transition is running, while what's on the slide is unknown. */
  get running(): boolean {
    return this.#transitions.size > 0;
  }

  /** Calls `listener` when a transition starts or ends. */
  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  /**
   * Applies the update of the last transition right away, if it's still
   * waiting for the snapshots of the old slide, e.g., before reading the
   * state that it changes.
   */
  flush(): void {
    this.#pending?.();
  }

  /** The last change made with {@link change}, once it's rendered. */
  getChange = (): SlideChange | undefined => this.#change;

  /** Calls `listener` when the last change made with {@link change} renders. */
  subscribeToChanges = (listener: () => void): (() => void) => {
    this.#changeListeners.add(listener);
    return () => {
      this.#changeListeners.delete(listener);
    };
  };

  /**
   * Keeps showing the slide as it was before the change being rendered, if
   * any, until the returned function is called, e.g., while a component of
   * the changed slide loads or measures something, which would otherwise
   * show in an unfinished state. Holds taken outside of a change do nothing,
   * so a component should hold while it's not ready, e.g., in a layout
   * effect, rather than for as long as it's mounted.
   *
   * The change is shown anyway once the deadline of every hold passes, so
   * that the talk isn't held up.
   *
   * @param deadline How long the change may wait for this hold, in
   *   milliseconds from the change, instead of {@link SETTLE_DEADLINE}. The
   *   greatest deadline among the holds counts, up to a few seconds.
   */
  hold(deadline: number = SETTLE_DEADLINE): () => void {
    const settling = this.#settling;
    if (settling === undefined) {
      return () => undefined;
    }
    const entry = { deadline };
    settling.holds.add(entry);
    return () => {
      settling.holds.delete(entry);
    };
  }

  /**
   * Calls `listener` while a change waits for the slide to settle, so that
   * components measure themselves again, since browsers don't notify resize
   * observers while they hold a view transition of the whole document.
   */
  subscribeToMeasure = (listener: () => void): (() => void) => {
    this.#measureListeners.add(listener);
    return () => {
      this.#measureListeners.delete(listener);
    };
  };

  /**
   * Changes the slides with `update`, e.g., to go to the next step, fading
   * them for the `duration` of `change`, if it's positive, and cutting to
   * the changed slides once they settle otherwise. Without view transitions,
   * or for `immediate` changes, the slides change at once. Components follow
   * the change with {@link getChange} as it renders, e.g., to animate along,
   * where the duration is 0 if the slides don't fade.
   */
  change(update: () => void, change: SlideChange): void {
    this.flush();
    this.#interrupt();
    const frames = change.immediate === true ? [] : this.#transitionFrames();
    // Components animate along, even where the slide cuts instead of fading.
    const animated =
      change.duration > 0 &&
      [...this.#frames].some(
        (frame) =>
          !this.#holdOnly.has(frame) &&
          frame.isConnected &&
          !prefersReducedMotion(frame),
      );
    const apply = () => {
      this.#change = {
        ...change,
        duration: animated ? change.duration : 0,
        shown: frames.length === 0,
      };
      for (const listener of this.#changeListeners) {
        listener();
      }
      update();
    };
    if (frames.length === 0) {
      this.#endSettling();
      apply();
    } else {
      this.run(apply, change.kind, change.duration);
    }
  }

  /** The frames that view transitions can run on now. */
  #transitionFrames(): HTMLElement[] {
    return [...this.#frames].filter((frame) => {
      const scopable = frame as ScopableElement;
      return (
        frame.isConnected &&
        (typeof scopable.startViewTransition === 'function' ||
          (!this.#holdOnly.has(frame) &&
            typeof frame.ownerDocument.startViewTransition === 'function'))
      );
    });
  }

  /** Ends the running transitions right away, e.g., for a click. */
  skip(): void {
    this.flush();
    this.#interrupt();
    for (const transition of this.#transitions.keys()) {
      transition.skipTransition();
    }
  }

  /**
   * Ends the last change right away, if it's still waiting or fading, e.g.,
   * when the presenter goes on before it ends: shows it, finishes the
   * animations that it set off, and tells components that follow it that
   * it was skipped, e.g., to stop waiting.
   */
  #interrupt(): void {
    if (!this.running && this.#settling === undefined) {
      return;
    }
    this.#endSettling();
    for (const frame of this.#frames) {
      const start = this.#changeTimes.get(frame.ownerDocument);
      if (start !== undefined) {
        forAnimationsSince(frame, start, (animation) => {
          animation.finish();
        });
      }
    }
    if (this.#change !== undefined && this.#change.skipped !== true) {
      this.#change = { ...this.#change, skipped: true };
      // Before the next transition captures the slide.
      // eslint-disable-next-line @eslint-react/dom-no-flush-sync
      flushSync(() => {
        for (const listener of this.#changeListeners) {
          listener();
        }
      });
    }
  }

  #endSettling(): void {
    const settling = this.#settling;
    if (settling === undefined) {
      return;
    }
    this.#settling = undefined;
    settling.end();
    if (this.#change?.shown === false) {
      this.#change = { ...this.#change, shown: true };
      for (const listener of this.#changeListeners) {
        listener();
      }
    }
  }

  /**
   * Changes the slides with `update`, e.g., to go to the next step, fading
   * the registered frames from how they looked before to how they look after
   * for `duration` milliseconds, or the duration of the theme. Frames whose
   * viewers prefer reduced motion cut instead. The changed slides are shown
   * once they settle. `update` may run later, but before any later update.
   */
  run(
    update: () => void,
    kind: SlideTransitionKind = 'step',
    duration?: number,
  ): void {
    // Keep the order of the updates, if the previous one is still waiting.
    this.flush();
    // Show the previous change as it is, and capture it as the old slide.
    this.#interrupt();
    const frames = this.#transitionFrames();
    if (frames.length === 0) {
      update();
      return;
    }
    let applied = false;
    let release: () => void = () => undefined;
    const ready = new Promise<void>((resolve) => {
      release = resolve;
    });
    const apply = () => {
      if (applied) {
        return;
      }
      applied = true;
      clearTimeout(timeout);
      if (this.#pending === apply) {
        this.#pending = undefined;
      }
      const animations = new Set<Animation>();
      const settling: Settling = {
        start: performance.now(),
        holds: new Set(),
        animations,
        end: () => {
          for (const animation of animations) {
            if (animation.playState === 'paused') {
              animation.play();
            }
          }
          release();
        },
      };
      // Components of the changed slide may hold it while they render.
      this.#settling = settling;
      this.#changeTimes = new Map(
        frames.map((frame) => [
          frame.ownerDocument,
          // Not every environment has timelines, e.g., jsdom.
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          Number(frame.ownerDocument.timeline?.currentTime ?? 0),
        ]),
      );
      // Render the update before the browser takes the new snapshots.
      // eslint-disable-next-line @eslint-react/dom-no-flush-sync
      flushSync(update);
      this.#pauseAnimations(frames, settling);
      void this.#settle(frames, settling);
    };
    const timeout = setTimeout(apply, UPDATE_TIMEOUT);
    this.#pending = apply;
    // Update once every frame has taken its snapshot of the old slide.
    let waiting = frames.length;
    const onCaptured = () => {
      waiting -= 1;
      if (waiting <= 0) {
        apply();
      }
      return ready;
    };
    for (const frame of frames) {
      // Transitions of the whole document cover what's painted over the slide,
      // e.g., the menu button, and some browsers don't keep the elements that
      // animate themselves live, so only scoped transitions fade.
      const cut =
        duration === 0 ||
        this.#holdOnly.has(frame) ||
        prefersReducedMotion(frame) ||
        typeof (frame as ScopableElement).startViewTransition !== 'function';
      const started = startTransition(
        frame,
        kind,
        cut ? 0 : duration,
        onCaptured,
      );
      if (started === undefined) {
        waiting -= 1;
        continue;
      }
      const { transition, scope } = started;
      this.#transitions.set(transition, scope);
      const finish = () => {
        this.#transitions.delete(transition);
        // Unless a later transition took over.
        if (![...this.#transitions.values()].includes(scope)) {
          scope.removeAttribute(TRANSITION_ATTRIBUTE);
          scope.style.removeProperty(DURATION_PROPERTY);
          frame.removeAttribute(TRANSITION_FRAME_ATTRIBUTE);
        }
        this.#notify();
      };
      // Skipped transitions reject, which isn't an error here.
      transition.finished.then(finish, finish);
      transition.ready.catch(() => undefined);
      transition.updateCallbackDone.then(
        () => {
          // Nothing to animate, and the snapshots would cover what's
          // painted over the slide, e.g., the menu button, for a frame.
          if (cut) {
            transition.skipTransition();
          }
        },
        () => undefined,
      );
    }
    if (waiting <= 0) {
      apply();
    }
    this.#notify();
  }

  /**
   * Waits until `frames` settle after a change, i.e., nothing in them changes
   * for a task, no component holds them, and their images and fonts have
   * loaded, or until the deadline, and then shows the change.
   */
  async #settle(frames: HTMLElement[], settling: Settling): Promise<void> {
    // Counts the changes of the frames, which observers see asynchronously.
    const mutations = { count: 0 };
    const observers = frames.flatMap((frame) => {
      const View = frame.ownerDocument.defaultView?.MutationObserver;
      if (View === undefined) {
        return [];
      }
      const observer = new View(() => {
        mutations.count += 1;
        this.#pauseAnimations(frames, settling);
      });
      observer.observe(frame, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true,
      });
      return [observer];
    });
    const [first] = frames;
    const deadline = () =>
      settling.start +
      Math.min(
        Math.max(
          SETTLE_DEADLINE,
          ...[...settling.holds].map((hold) => hold.deadline),
        ),
        MAX_SETTLE_DEADLINE,
      );
    try {
      while (this.#settling === settling && first !== undefined) {
        const before = mutations.count;
        // Let React render what the change set off, e.g., in effects.
        await nextTask(first);
        for (const listener of this.#measureListeners) {
          listener();
        }
        // And what measuring again set off.
        await nextTask(first);
        this.#pauseAnimations(frames, settling);
        const mutated = mutations.count !== before;
        const loading = frames.some(isLoading);
        if (
          this.#settling !== settling ||
          (!mutated && !loading && settling.holds.size === 0) ||
          performance.now() >= deadline()
        ) {
          break;
        }
        if (!mutated) {
          await nextTask(first, SETTLE_POLL);
        }
      }
    } finally {
      for (const observer of observers) {
        observer.disconnect();
      }
      if (this.#settling === settling) {
        // Play the animations that the change set off from the start, along
        // with the fade.
        this.#pauseAnimations(frames, settling);
        for (const animation of settling.animations) {
          try {
            animation.currentTime = 0;
          } catch {
            // E.g., an animation that was just canceled.
          }
        }
        this.#endSettling();
      }
    }
  }

  /** Pauses the animations that the change set off since the last call. */
  #pauseAnimations(frames: readonly HTMLElement[], settling: Settling): void {
    if (this.#settling !== settling) {
      return;
    }
    for (const frame of frames) {
      const start = this.#changeTimes.get(frame.ownerDocument);
      if (start === undefined) {
        continue;
      }
      forAnimationsSince(frame, start, (animation) => {
        if (!settling.animations.has(animation)) {
          settling.animations.add(animation);
          animation.pause();
        }
      });
    }
  }

  #notify(): void {
    for (const listener of this.#listeners) {
      listener();
    }
  }
}

/** The transitions of the slides of the enclosing deck. */
export const SlideTransitionsContext: Context<SlideTransitions> = createContext(
  new SlideTransitions(),
);
