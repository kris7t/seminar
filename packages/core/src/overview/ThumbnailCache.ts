import type { DeckStateStore } from '../state/DeckStateStore.ts';
import type { SlideStateStore } from '../state/SlideStateStore.ts';
import { captureThumbnail } from './captureThumbnail.ts';
import { slideBackground } from '../view/slideBackground.ts';

/** A step path and view kind; no state values are retained. */
export interface ThumbnailState {
  path: string;
}

/** Images of the slides, owned by a single version of a deck. */
export class ThumbnailCache {
  readonly #images = new Map<number, string>();
  readonly #backgrounds = new Map<number, string>();
  readonly #versions = new Map<number, number>();
  readonly #snapshots = new Map<number, Map<string, string>>();
  readonly #selected = new Map<number, ThumbnailState>();
  readonly #deckStateUsers = new Map<string, Set<number>>();
  readonly #slideStateUsers = new Map<number, Set<number>>();
  readonly #invalidations = new Map<number, symbol>();
  readonly #invalidationListeners = new Map<number, Set<() => void>>();
  #queueVersion = 0;
  readonly #shown = new Map<number, number>();
  readonly #attempted = new Set<number>();
  readonly #listeners = new Set<() => void>();
  readonly #foreground = new Set<symbol>();
  readonly #background = new Set<AbortController>();
  #visible = new Set<number>();
  #visibilityVersion = 0;

  get(index: number): string | undefined {
    return this.#images.get(index);
  }

  /** The last known background color, also available before an image is ready. */
  getBackground(index: number): string | undefined {
    return this.#backgrounds.get(index);
  }

  /** Records a probed or shown background for the thumbnail placeholder. */
  setBackground(index: number, color: string | undefined): void {
    if (color === undefined || this.#backgrounds.get(index) === color) return;
    this.#backgrounds.set(index, color);
    this.#notify();
  }

  /** Whether shown slides need the capture work ahead of background slides. */
  isCapturingShown = (): boolean => this.#foreground.size > 0;

  /** Changes when the overview's visible thumbnails change. */
  getVisibilityVersion = (): number => this.#visibilityVersion;

  /** Gives thumbnails in the overview viewport priority over off-screen slides. */
  setVisible(indices: Iterable<number>): void {
    const visible = new Set(indices);
    if (
      visible.size === this.#visible.size &&
      [...visible].every((index) => this.#visible.has(index))
    )
      return;
    this.#visible = visible;
    this.#visibilityVersion += 1;
    this.#notify();
  }

  /** Whether the overview currently shows this thumbnail. */
  isVisible(index: number): boolean {
    return this.#visible.has(index);
  }

  /** Records the deck-state keys that a slide reads in any of its views. */
  recordDeckStateUse = (index: number, key: string): void => {
    let users = this.#deckStateUsers.get(key);
    if (users === undefined) {
      users = new Set();
      this.#deckStateUsers.set(key, users);
    }
    users.add(index);
  };

  /** Records shared slide state, including dependencies of recaps. */
  recordSlideStateUse = (index: number, stateIndex: number): void => {
    let users = this.#slideStateUsers.get(stateIndex);
    if (users === undefined) {
      users = new Set();
      this.#slideStateUsers.set(stateIndex, users);
    }
    users.add(index);
  };

  /** Keeps dependency tracking alive after the slide views unmount. */
  observe(deck: DeckStateStore, slides: SlideStateStore): () => void {
    const invalidate = <K>(keys: readonly K[], users: Map<K, Set<number>>) => {
      const affected = new Set(
        keys.flatMap((key) => [...(users.get(key) ?? [])]),
      );
      for (const index of affected) this.invalidate(index);
    };
    const unsubscribeDeck = deck.subscribeState((keys) => {
      invalidate(keys, this.#deckStateUsers);
    });
    const unsubscribeSlides = slides.subscribeState((indices) => {
      invalidate(indices, this.#slideStateUsers);
    });
    return () => {
      unsubscribeDeck();
      unsubscribeSlides();
    };
  }

  /** Changes when state invalidation queues thumbnails for rendering again. */
  getQueueVersion = (): number => this.#queueVersion;

  /** Identifies state invalidations that supersede a pending background job. */
  getInvalidation(index: number): symbol | undefined {
    return this.#invalidations.get(index);
  }

  /** Lets mounted slides refresh from their actual appearance after invalidation. */
  subscribeInvalidation(index: number, listener: () => void): () => void {
    let listeners = this.#invalidationListeners.get(index);
    if (listeners === undefined) {
      listeners = new Set();
      this.#invalidationListeners.set(index, listeners);
    }
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.#invalidationListeners.delete(index);
    };
  }

  /** Whether the requested path has a successful capture since invalidation. */
  isCurrent(index: number, state: ThumbnailState): boolean {
    return this.#snapshots.get(index)?.has(state.path) ?? false;
  }

  /** Selects a path and restores its image if captured. */
  restore(index: number, state: ThumbnailState): boolean {
    const previous = this.#selected.get(index);
    if (previous?.path !== state.path) {
      this.#selected.set(index, state);
      this.#versions.set(index, (this.#versions.get(index) ?? 0) + 1);
    }
    const snapshots = this.#snapshots.get(index);
    const image = snapshots?.get(state.path);
    if (image === undefined) return false;
    if (this.#images.get(index) !== image) {
      this.#images.set(index, image);
      this.#notify();
    }
    return true;
  }

  /** Invalidates one path, or all paths, keeping the last image as a fallback. */
  invalidate(index: number, state?: ThumbnailState): void {
    if (state !== undefined) {
      this.#snapshots.get(index)?.delete(state.path);
      this.#versions.set(index, (this.#versions.get(index) ?? 0) + 1);
      return;
    }
    this.#snapshots.delete(index);
    this.#attempted.delete(index);
    this.#versions.set(index, (this.#versions.get(index) ?? 0) + 1);
    this.#invalidations.set(index, Symbol());
    this.#queueVersion += 1;
    for (const listener of this.#invalidationListeners.get(index) ?? [])
      listener();
    this.#notify();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  /** Reserves shown slides for captures of their actual appearance. */
  shown(index: number): () => void {
    this.#shown.set(index, (this.#shown.get(index) ?? 0) + 1);
    this.#versions.set(index, (this.#versions.get(index) ?? 0) + 1);
    return () => {
      const remaining = (this.#shown.get(index) ?? 1) - 1;
      if (remaining === 0) this.#shown.delete(index);
      else this.#shown.set(index, remaining);
      this.#queueVersion += 1;
      this.#notify();
    };
  }

  /** Finds the nearest missing slide, leaving foreground captures uninterrupted. */
  nextMissing(count: number, near = 0): number | undefined {
    if (this.isCapturingShown()) return undefined;
    const center = Math.max(0, Math.min(near, count - 1));
    for (const visible of [true, false]) {
      for (let distance = 0; distance < count; distance += 1) {
        for (const index of distance === 0
          ? [center]
          : [center + distance, center - distance]) {
          if (
            index >= 0 &&
            index < count &&
            this.#visible.has(index) === visible &&
            !this.#shown.has(index) &&
            !this.#attempted.has(index)
          )
            return index;
        }
      }
    }
    return undefined;
  }

  /** Failed background captures wait for invalidation or a shown view. */
  skip(index: number): void {
    this.#attempted.add(index);
  }

  async capture(
    index: number,
    frame: HTMLElement,
    shown = false,
    signal?: AbortSignal,
    state?: ThumbnailState,
  ): Promise<void> {
    if (signal?.aborted) return;
    if (!shown && this.isCapturingShown()) return;
    if (!shown && this.#shown.has(index)) {
      return;
    }
    if (state !== undefined && this.restore(index, state)) return;
    this.setBackground(index, slideBackground(frame));
    const release = shown ? this.#prioritize(signal) : undefined;
    const controller = shown ? undefined : new AbortController();
    if (controller !== undefined) {
      this.#background.add(controller);
      signal =
        signal === undefined
          ? controller.signal
          : AbortSignal.any([signal, controller.signal]);
    }
    const onAbort = () => {
      if (!shown) this.#attempted.delete(index);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    this.#attempted.add(index);
    const version = (this.#versions.get(index) ?? 0) + 1;
    this.#versions.set(index, version);
    try {
      const image = await captureThumbnail(frame, signal);
      if (!signal?.aborted && this.#versions.get(index) === version) {
        this.#images.set(index, image);
        if (state === undefined) {
          this.#snapshots.delete(index);
          this.#selected.delete(index);
        } else {
          let snapshots = this.#snapshots.get(index);
          if (snapshots === undefined) {
            snapshots = new Map();
            this.#snapshots.set(index, snapshots);
          }
          snapshots.set(state.path, image);
        }
        this.#notify();
      }
    } catch {
      // Media or styles from another origin may forbid capturing a slide.
      // Keep its last successful image, or the placeholder, and keep going.
    } finally {
      signal?.removeEventListener('abort', onAbort);
      if (controller !== undefined) this.#background.delete(controller);
      release?.();
    }
  }

  #prioritize(signal: AbortSignal | undefined): () => void {
    const job = Symbol();
    this.#foreground.add(job);
    for (const controller of this.#background) controller.abort();
    this.#notify();
    const release = () => {
      signal?.removeEventListener('abort', release);
      if (this.#foreground.delete(job)) this.#notify();
    };
    signal?.addEventListener('abort', release, { once: true });
    return release;
  }

  #notify(): void {
    for (const listener of this.#listeners) listener();
  }
}
