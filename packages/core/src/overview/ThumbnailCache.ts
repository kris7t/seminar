import { captureThumbnail } from './captureThumbnail.ts';

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
  readonly #versions = new Map<number, number>();
  readonly #snapshots = new Map<number, Snapshots>();
  readonly #selected = new Map<number, ThumbnailState>();
  readonly #deckStateUsers = new Set<number>();
  readonly #shown = new Set<number>();
  readonly #attempted = new Set<number>();
  readonly #listeners = new Set<() => void>();

  get(index: number): string | undefined {
    return this.#images.get(index);
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

  nextMissing(count: number): number | undefined {
    for (let index = 0; index < count; index += 1) {
      if (!this.#shown.has(index) && !this.#attempted.has(index)) {
        return index;
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
    if (!shown && this.#shown.has(index)) {
      return;
    }
    if (state !== undefined && this.restore(index, state)) return;
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
    }
  }

  #notify(): void {
    for (const listener of this.#listeners) listener();
  }
}
