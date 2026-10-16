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

/** Safety net for update callbacks that the browser doesn't call. */
const UPDATE_TIMEOUT = 1000;

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

/**
 * Fades the slides shown in some views, like the audience and the presenter
 * view, from one step to another with view transitions, at the same time in
 * every window.
 *
 * Fading snapshots of the whole slide, rather than each step on its own,
 * keeps nested steps from showing through while their parents fade, and
 * works with any change of the slide, e.g., by components that follow the
 * steps. Where view transitions aren't supported, steps change right away.
 */
export class SlideTransitions {
  readonly #frames = new Set<HTMLElement>();
  /** The running transitions, and the elements they run on. */
  readonly #transitions = new Map<ViewTransition, HTMLElement>();
  readonly #listeners = new Set<() => void>();
  /** Applies the update of the last transition, if it hasn't been yet. */
  #pending: (() => void) | undefined;

  /**
   * Fades `frame`, an element that shows a slide, when steps change. The
   * frame must be the only element with a slide in its document that's
   * registered.
   *
   * @returns A function that stops fading the frame.
   */
  register(frame: HTMLElement): () => void {
    this.#frames.add(frame);
    return () => {
      this.#frames.delete(frame);
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

  /** Ends the running transitions right away, e.g., for a click. */
  skip(): void {
    this.flush();
    for (const transition of this.#transitions.keys()) {
      transition.skipTransition();
    }
  }

  /**
   * Changes the slides with `update`, e.g., to go to the next step, fading
   * the registered frames from how they looked before to how they look after.
   * `update` may run later, but before any later update.
   */
  run(
    update: () => void,
    kind: SlideTransitionKind = 'step',
    duration?: number,
  ): void {
    // Keep the order of the updates, if the previous one is still waiting.
    this.flush();
    const frames = [...this.#frames].filter(
      (frame) => frame.isConnected && !prefersReducedMotion(frame),
    );
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
      // Render the update before the browser takes the new snapshots.
      // eslint-disable-next-line @eslint-react/dom-no-flush-sync
      flushSync(update);
      release();
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
      const started = startTransition(frame, kind, duration, onCaptured);
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
      transition.updateCallbackDone.catch(() => undefined);
    }
    if (waiting <= 0) {
      apply();
    }
    this.#notify();
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
