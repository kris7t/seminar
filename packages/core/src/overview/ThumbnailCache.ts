import { captureThumbnail } from './captureThumbnail.ts';
import { slideBackground } from '../view/slideBackground.ts';

/** Small generation and step keys; no state values are retained. */
export interface ThumbnailState {
  generation: string;
  path: string;
}

interface Snapshots {
  generation: string;
  images: Map<string, string>;
}

/** Images of the slides, owned by a single version of a deck. */
export class ThumbnailCache {
  readonly #images = new Map<number, string>();
  readonly #backgrounds = new Map<number, string>();
  readonly #versions = new Map<number, number>();
  readonly #snapshots = new Map<number, Snapshots>();
  readonly #selected = new Map<number, ThumbnailState>();
  readonly #deckStateUsers = new Set<number>();
  readonly #shown = new Set<number>();
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

  /** Records a deck-state read for this version of a slide. */
  recordDeckStateUse = (index: number): void => {
    this.#deckStateUsers.add(index);
  };

  /** Whether any view of the slide has read deck state. */
  usesDeckState(index: number): boolean {
    return this.#deckStateUsers.has(index);
  }

  /** Whether this generation has a successful capture of the requested path. */
  isCurrent(index: number, state: ThumbnailState): boolean {
    const snapshots = this.#snapshots.get(index);
    return (
      snapshots?.generation === state.generation &&
      snapshots.images.has(state.path)
    );
  }

  /** Selects a path, discarding older generations and restoring its image if captured. */
  restore(index: number, state: ThumbnailState): boolean {
    const previous = this.#selected.get(index);
    if (
      previous?.generation !== state.generation ||
      previous.path !== state.path
    ) {
      this.#selected.set(index, state);
      this.#versions.set(index, (this.#versions.get(index) ?? 0) + 1);
    }
    const snapshots = this.#snapshots.get(index);
    if (snapshots?.generation !== state.generation) {
      this.#snapshots.delete(index);
      return false;
    }
    const image = snapshots.images.get(state.path);
    if (image === undefined) return false;
    if (this.#images.get(index) !== image) {
      this.#images.set(index, image);
      this.#notify();
    }
    return true;
  }

  /** Invalidates one path, or all paths, keeping the last image as a fallback. */
  invalidate(index: number, state?: ThumbnailState): void {
    if (state === undefined) this.#snapshots.delete(index);
    else {
      const snapshots = this.#snapshots.get(index);
      if (snapshots?.generation === state.generation)
        snapshots.images.delete(state.path);
    }
    this.#versions.set(index, (this.#versions.get(index) ?? 0) + 1);
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  /** Reserves shown slides for captures of their actual appearance. */
  shown(index: number): void {
    this.#shown.add(index);
    this.#versions.set(index, (this.#versions.get(index) ?? 0) + 1);
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

  /** Failed background captures are skipped until the slide is shown. */
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
          if (snapshots?.generation !== state.generation) {
            snapshots = { generation: state.generation, images: new Map() };
            this.#snapshots.set(index, snapshots);
          }
          snapshots.images.set(state.path, image);
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
