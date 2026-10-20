import { captureThumbnail } from './captureThumbnail.ts';

/** Images of the slides, owned by a single version of a deck. */
export class ThumbnailCache {
  readonly #images = new Map<number, string>();
  readonly #versions = new Map<number, number>();
  readonly #shown = new Set<number>();
  readonly #attempted = new Set<number>();
  readonly #listeners = new Set<() => void>();

  get(index: number): string | undefined {
    return this.#images.get(index);
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
  ): Promise<void> {
    if (!shown && this.#shown.has(index)) {
      return;
    }
    this.#attempted.add(index);
    const version = (this.#versions.get(index) ?? 0) + 1;
    this.#versions.set(index, version);
    try {
      const image = await captureThumbnail(frame);
      if (this.#versions.get(index) === version) {
        this.#images.set(index, image);
        for (const listener of this.#listeners) {
          listener();
        }
      }
    } catch {
      // Media or styles from another origin may forbid capturing a slide.
      // Keep its last successful image, or the placeholder, and keep going.
    }
  }
}
