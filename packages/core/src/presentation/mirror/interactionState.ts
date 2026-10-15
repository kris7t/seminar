/** Position of an element in a slide, as indices of children from its root. */
export type ElementPath = readonly number[];

/** Material UI classes that reflect focus, which it sets from focus events. */
export const MIRRORED_CLASSES = ['Mui-focused', 'Mui-focusVisible'] as const;

/** The selection and the text of the focused text field. */
export interface InputState {
  path: ElementPath;
  value: string;
  selectionStart: number;
  selectionEnd: number;
  /** Whether the caret is at the start or at the end of the selection. */
  backward: boolean;
  scrollLeft: number;
  scrollTop: number;
}

/**
 * A press of the primary mouse button, which starts effects like the ripple of
 * Material UI buttons.
 */
export interface PressState {
  /** Tells presses apart, even if one starts and ends between updates. */
  id: number;
  path: ElementPath;
  /** Where the press is in the pressed element, as fractions of its size. */
  x: number;
  y: number;
  released: boolean;
}

/**
 * The state of the interaction of the presenter with a slide that the slide
 * itself doesn't keep, like hover and focus, to show it to the audience.
 */
export interface InteractionState {
  /** The innermost element under the mouse pointer. */
  hover: ElementPath | undefined;
  focus: ElementPath | undefined;
  /** Whether the browser shows the focus, e.g., after keyboard navigation. */
  focusVisible: boolean;
  /** Elements with {@link MIRRORED_CLASSES}. */
  classes: readonly { path: ElementPath; className: string }[];
  input: InputState | undefined;
  /** The last press, which may have been released already. */
  press: PressState | undefined;
}

export const NO_INTERACTION: InteractionState = {
  hover: undefined,
  focus: undefined,
  focusVisible: false,
  classes: [],
  input: undefined,
  press: undefined,
};

/** Keeps the {@link InteractionState} of the presenter. */
export interface InteractionStore {
  get: () => InteractionState;
  set: (state: InteractionState) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createInteractionStore(): InteractionStore {
  let state = NO_INTERACTION;
  let serialized = JSON.stringify(state);
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set: (newState) => {
      // States are captured often, but rarely change.
      const newSerialized = JSON.stringify(newState);
      if (newSerialized === serialized) {
        return;
      }
      state = newState;
      serialized = newSerialized;
      for (const listener of listeners) {
        listener();
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Returns the path of `element` in `root`, if it's in `root`. */
export function pathOf(
  root: Element,
  element: Element,
): ElementPath | undefined {
  const path: number[] = [];
  let current = element;
  while (current !== root) {
    const parent = current.parentElement;
    if (parent === null) {
      return undefined;
    }
    path.push(Array.prototype.indexOf.call(parent.children, current));
    current = parent;
  }
  return path.reverse();
}

/** Returns the element at `path` in `root`, if there is one. */
export function resolvePath(
  root: Element,
  path: ElementPath,
): Element | undefined {
  let current: Element | undefined = root;
  for (const index of path) {
    current = current.children[index];
    if (current === undefined) {
      return undefined;
    }
  }
  return current;
}

/**
 * Whether `element` is a text field with a selection. Checks the name of the
 * element instead of its class, since it may be in another window.
 */
export function isTextField(
  element: Element | null | undefined,
): element is HTMLInputElement | HTMLTextAreaElement {
  if (element?.nodeName === 'TEXTAREA') {
    return true;
  }
  // Only some types of inputs have a selection, e.g., not numbers.
  return (
    element?.nodeName === 'INPUT' &&
    (element as HTMLInputElement).selectionStart !== null
  );
}
