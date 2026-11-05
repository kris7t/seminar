import {
  use,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type ReactElement,
} from 'react';

import { getSourceRange } from '../host/sourceRanges.ts';
import {
  editedDirective,
  getEditStore,
  type AttributeChanges,
  type EditedDirective,
} from './editStore.ts';
import { EditingContext } from './EditingContext.ts';

/** A directive whose attributes an {@link Editable} edits along with its own. */
export interface EditTarget<P extends object = Record<string, unknown>> {
  /** The props of the directive, with its edited attributes. */
  readonly props: P;
  /**
   * Shows the directive with `changes` of its attributes, `null` to remove
   * them, until {@link Editable.commit} or {@link Editable.cancel}.
   */
  preview: (changes: AttributeChanges) => void;
}

/**
 * A directive whose attributes can be edited on the slide, see
 * {@link useEditable}.
 */
export interface Editable<
  P extends object = Record<string, unknown>,
> extends EditTarget<P> {
  /** Identifies the directive among those on the slide. */
  readonly key: string;
  /**
   * Whether the directive should show its handles: it's the innermost
   * editable directive under the pointer, or one of its handles is dragged.
   */
  readonly active: boolean;
  /** Returns the directive of `child` to edit along with this one. */
  of: <C extends object>(child: ReactElement<C>) => EditTarget<C> | undefined;
  /**
   * Edits the source of this directive and those of {@link of} as they're
   * previewed, in a single edit, which the editor can undo at once.
   */
  commit: () => void;
  /** Stops previewing the changes of this directive and those of {@link of}. */
  cancel: () => void;
}

const subscribeToNothing = () => () => undefined;
const noVersion = () => 0;

/** The props of the elements of editable directives, with their keys. */
const editables = new WeakMap<object, string>();

/** Returns the key of the editable directive with `props`, if any. */
export function editableKeyOf(props: object): string | undefined {
  return editables.get(props);
}

/** Returns the edits of the page, and renders again when they change. */
function useEditStore() {
  const store = getEditStore();
  useSyncExternalStore(
    store?.subscribe ?? subscribeToNothing,
    store?.getVersion ?? noVersion,
    noVersion,
  );
  return store;
}

/**
 * Returns the props of a directive component with the attributes that are
 * edited in the editor or on the slide, until the page compiles the saved
 * deck. Directive components whose attributes others edit, e.g., a column of
 * columns that are resized, should render these, rather than `props`.
 */
export function useEditedProps<P extends object>(props: P): P {
  const store = useEditStore();
  const directive = editedDirective(getSourceRange(props));
  return store === undefined || directive === undefined
    ? props
    : store.apply(props, directive);
}

/**
 * Lets a directive component edit its attributes, and those of the directives
 * of its children, with handles on the slide, e.g., with `DragHandle`s.
 * Returns `undefined` unless the slide is edited in its view, e.g., in the
 * preview of an editor, and the directive is in the source of the deck.
 *
 * @param props The props of the component, as it got them.
 */
export function useEditable<P extends object>(
  props: P,
): Editable<P> | undefined {
  const store = useEditStore();
  const editing = use(EditingContext);
  const directive = editedDirective(getSourceRange(props));
  const key = directive?.key;
  // The directives previewed since the last commit.
  const [previewed] = useState(() => new Map<string, EditedDirective>());
  useLayoutEffect(() => {
    if (key === undefined || editing === undefined) {
      return undefined;
    }
    editables.set(props, key);
    return () => {
      editables.delete(props);
    };
  }, [props, key, editing]);
  if (store === undefined || editing === undefined || directive === undefined) {
    return undefined;
  }
  const target = <C extends object>(
    targetProps: C,
    at: EditedDirective,
  ): EditTarget<C> => ({
    props: store.apply(targetProps, at),
    preview: (changes) => {
      previewed.set(at.key, at);
      store.preview(at, changes);
    },
  });
  return {
    ...target(props, directive),
    key: directive.key,
    active: (editing.dragging ?? editing.hovered) === directive.key,
    of: (child) => {
      const at = editedDirective(getSourceRange(child.props));
      return at === undefined ? undefined : target(child.props, at);
    },
    commit: () => {
      store.commit(previewed.values());
      previewed.clear();
    },
    cancel: () => {
      store.cancel(previewed.values());
      previewed.clear();
    },
  };
}
