import { getDevChannel, type DevChannel } from '../host/devChannel.ts';
import type { SourceRange } from '../host/sourceRanges.ts';

/** The value of an attribute of a directive, as its component gets it. */
export type AttributeValue = string | number | boolean;

/** Values to set the attributes of a directive to, or `null` to remove them. */
export type AttributeChanges = Readonly<Record<string, AttributeValue | null>>;

/** The version of the messages, which both sides ignore if it isn't theirs. */
const VERSION = 1;

/** The attributes of a directive that the editor tells were edited. */
interface PendingEntry {
  /** The attributes in the saved source, which the page was compiled from. */
  saved: Readonly<Record<string, AttributeValue>>;
  /** The attributes in the source of the editor. */
  attributes: Readonly<Record<string, AttributeValue>>;
}

/** A directive whose attributes are edited, where it is in the saved source. */
export interface EditedDirective {
  key: string;
  range: SourceRange & { file: string };
}

/** Returns the directive at `range`, which needs a file to be edited. */
export function editedDirective(
  range: SourceRange | undefined,
): EditedDirective | undefined {
  const file = range?.file;
  if (range === undefined || file === undefined) {
    return undefined;
  }
  const { start, end } = range;
  return {
    key: [file, start.line, start.column, end.line, end.column].join('\0'),
    range: { start, end, file },
  };
}

function isAttributes(value: unknown): value is Record<string, AttributeValue> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.values(value).every(
      (attribute) =>
        typeof attribute === 'string' ||
        typeof attribute === 'number' ||
        typeof attribute === 'boolean',
    )
  );
}

/**
 * Whether `props` were compiled from the `saved` attributes, rather than
 * from the source with the edits, once it was saved.
 */
function compiledFrom(
  props: Readonly<Record<string, unknown>>,
  { saved, attributes }: PendingEntry,
): boolean {
  return [...Object.keys(saved), ...Object.keys(attributes)].every(
    (name) => props[name] === saved[name],
  );
}

/**
 * The attributes of directives edited in the editor, and those being edited
 * on the page, which the page shows until it compiles the saved deck.
 */
export class EditStore {
  readonly #channel: DevChannel;
  /** What the editor tells, by file, then by directive. */
  readonly #pending = new Map<string, Map<string, PendingEntry>>();
  /** What is being edited on the page, by directive. */
  readonly #drafts = new Map<string, AttributeChanges>();
  /** The drafts sent to the editor, by directive, until it tells their file. */
  readonly #sent = new Map<string, string>();
  readonly #listeners = new Set<() => void>();
  #version = 0;

  constructor(channel: DevChannel) {
    this.#channel = channel;
    channel.on('pendingAttributes', (data) => {
      this.#receive(data);
    });
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  /** Changes whenever what {@link apply} returns may change. */
  readonly getVersion = (): number => this.#version;

  /** Returns `props` of `directive` with its edited attributes. */
  apply<P extends object>(props: P, { key, range }: EditedDirective): P {
    const entry = this.#pending.get(range.file)?.get(key);
    const draft = this.#drafts.get(key);
    if (entry === undefined && draft === undefined) {
      return props;
    }
    const edited = { ...props } as Record<string, unknown>;
    if (entry !== undefined && compiledFrom(edited, entry)) {
      for (const name of Object.keys(entry.saved)) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- Attributes are dynamic.
        delete edited[name];
      }
      Object.assign(edited, entry.attributes);
    }
    for (const [name, value] of Object.entries(draft ?? {})) {
      if (value === null) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- Attributes are dynamic.
        delete edited[name];
      } else {
        edited[name] = value;
      }
    }
    return edited as unknown as P;
  }

  /** Shows `changes` of `directive` on the page, without editing its source. */
  preview({ key }: EditedDirective, changes: AttributeChanges): void {
    this.#drafts.set(key, { ...this.#drafts.get(key), ...changes });
    this.#sent.delete(key);
    this.#changed();
  }

  /** Stops showing what is being edited of `directives`. */
  cancel(directives: Iterable<EditedDirective>): void {
    for (const { key } of directives) {
      this.#drafts.delete(key);
      this.#sent.delete(key);
    }
    this.#changed();
  }

  /**
   * Asks the editor to edit the source of `directives` as they're shown, in
   * a single edit, and shows them so until it tells what they are now.
   */
  commit(directives: Iterable<EditedDirective>): void {
    const edits = [];
    for (const { key, range } of directives) {
      const changes = this.#drafts.get(key);
      if (changes !== undefined) {
        edits.push({ range, changes });
        this.#sent.set(key, range.file);
      }
    }
    if (edits.length > 0) {
      this.#channel.send('editAttributes', { version: VERSION, edits });
    }
  }

  #receive(data: unknown): void {
    const { version, file, entries } = (data ?? {}) as {
      version?: unknown;
      file?: unknown;
      entries?: unknown;
    };
    if (
      version !== VERSION ||
      typeof file !== 'string' ||
      !Array.isArray(entries)
    ) {
      return;
    }
    const pending = new Map<string, PendingEntry>();
    for (const entry of entries as unknown[]) {
      const { range, wrapper, saved, attributes } = (entry ?? {}) as {
        range?: SourceRange;
        wrapper?: unknown;
        saved?: unknown;
        attributes?: unknown;
      };
      const directive = editedDirective(
        range === undefined ? undefined : { ...range, file },
      );
      if (
        directive !== undefined &&
        wrapper === undefined &&
        isAttributes(saved) &&
        isAttributes(attributes)
      ) {
        pending.set(directive.key, { saved, attributes });
      }
    }
    this.#pending.set(file, pending);
    for (const [key, sentFile] of this.#sent) {
      if (sentFile === file) {
        this.#drafts.delete(key);
        this.#sent.delete(key);
      }
    }
    this.#changed();
  }

  #changed(): void {
    this.#version += 1;
    for (const listener of this.#listeners) {
      listener();
    }
  }
}

const stores = new WeakMap<DevChannel, EditStore>();

/**
 * Returns the attributes of directives edited in the editor, if the page has
 * a channel to it.
 */
export function getEditStore(): EditStore | undefined {
  const channel = getDevChannel();
  if (channel === undefined) {
    return undefined;
  }
  let store = stores.get(channel);
  if (store === undefined) {
    store = new EditStore(channel);
    stores.set(channel, store);
  }
  return store;
}
