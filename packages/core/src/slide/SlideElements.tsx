import {
  createContext,
  createElement,
  use,
  useCallback,
  useId,
  useState,
  useSyncExternalStore,
  type ComponentProps,
  type Context,
  type ElementType,
  type JSX,
  type ReactNode,
  type RefCallback,
} from 'react';

/**
 * The elements named in one rendering of a slide, e.g., with `{#name}` in
 * MDX. A deck renders a slide in several views at once, as well as in recaps
 * and copies, so names are only unique within a rendering, and every
 * rendering gives its elements ids of its own.
 */
export class SlideElementStore {
  /** Prefix of the ids of the elements in the document. */
  readonly prefix: string;
  readonly #elements = new Map<string, Element>();
  readonly #listeners = new Set<() => void>();

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  /** Returns the id in the document of the element called `name`. */
  idOf(name: string): string {
    return `${this.prefix}${name}`;
  }

  /** Returns the element called `name`, if it's rendered. */
  get(name: string): Element | undefined {
    return this.#elements.get(name);
  }

  /**
   * Registers `element` as the element called `name`. If another element is
   * already called that, it keeps the name.
   *
   * @returns A function that unregisters the element.
   */
  register(name: string, element: Element): () => void {
    const existing = this.#elements.get(name);
    if (existing !== undefined && existing !== element) {
      console.warn(`There are several elements called \`${name}\` on a slide.`);
      return () => undefined;
    }
    this.#elements.set(name, element);
    this.#notify();
    return () => {
      if (this.#elements.get(name) === element) {
        this.#elements.delete(name);
        this.#notify();
      }
    };
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  #notify(): void {
    for (const listener of this.#listeners) {
      listener();
    }
  }
}

export const SlideElementContext: Context<SlideElementStore | undefined> =
  createContext<SlideElementStore | undefined>(undefined);

/**
 * Provides a scope of element names for a rendering of a slide (see
 * {@link SlideElementStore}).
 */
export function SlideElementScope({
  children,
}: {
  children?: ReactNode;
}): JSX.Element {
  // Ids from `useId` may have characters, like colons, that need escaping in
  // selectors and in `url(#…)`.
  const prefix = `slider-${useId().replace(/[^\w-]/g, '')}-`;
  const [store] = useState(() => new SlideElementStore(prefix));
  return <SlideElementContext value={store}>{children}</SlideElementContext>;
}

/**
 * Returns the id in the document of the element called `name` on the
 * enclosing slide. Outside of slides, it's `name` itself.
 */
export function useSlideElementId(name: string): string {
  return use(SlideElementContext)?.idOf(name) ?? name;
}

/**
 * Returns a ref that makes the element it's attached to the element called
 * `name` on the enclosing slide, for {@link useSlideElement}. Warns if there
 * are several elements called `name`.
 */
export function useSlideElementRef(name: string): RefCallback<Element> {
  const store = use(SlideElementContext);
  return useCallback(
    (element: Element | null) =>
      element === null ? undefined : store?.register(name, element),
    [store, name],
  );
}

const NO_ELEMENT = (): undefined => undefined;
const NO_SUBSCRIPTION = (): (() => void) => () => undefined;

/**
 * Returns the element called `name` on the enclosing slide, in the same
 * rendering of the slide, once it's rendered.
 */
export function useSlideElement(name: string | undefined): Element | undefined {
  const store = use(SlideElementContext);
  const getSnapshot = useCallback(
    () => (name === undefined ? undefined : store?.get(name)),
    [store, name],
  );
  return useSyncExternalStore(
    store?.subscribe ?? NO_SUBSCRIPTION,
    store === undefined ? NO_ELEMENT : getSnapshot,
    NO_ELEMENT,
  );
}

export type SlideElementProps<T extends ElementType> = {
  /** The element or component to render. */
  as: T;
  /** Name of the element on the slide. */
  name: string;
} & Omit<ComponentProps<T>, 'id' | 'ref'>;

/**
 * Renders `as` as the element called `name` on the enclosing slide, with an
 * id that is unique in the document, even if the slide is rendered several
 * times. Components get the id and a ref, which they should pass to their
 * root element.
 *
 * MDX decks render elements with an `id` in a slide like this.
 */
export function SlideElement<T extends ElementType>({
  as,
  name,
  ...props
}: SlideElementProps<T>): JSX.Element {
  const id = useSlideElementId(name);
  const ref = useSlideElementRef(name);
  return createElement(as, { ...props, id, ref });
}
