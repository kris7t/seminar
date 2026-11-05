import { describe, expect, it } from 'vitest';

import type { DevChannel } from '../host/devChannel.ts';
import { editedDirective, EditStore } from './editStore.ts';

const FILE = '/deck.deck.mdx';
const range = {
  start: { line: 3, column: 1 },
  end: { line: 5, column: 4 },
  file: FILE,
};

function createStore() {
  const sent: [string, unknown][] = [];
  let receive: ((data: unknown) => void) | undefined;
  const channel: DevChannel = {
    send: (event, data) => {
      sent.push([event, data]);
    },
    on: (_event, listener) => {
      receive = listener;
      return () => undefined;
    },
  };
  const store = new EditStore(channel);
  const tell = (saved: object, attributes: object) => {
    receive?.({
      version: 1,
      file: FILE,
      entries: [{ range, saved, attributes }],
    });
  };
  return { store, sent, tell };
}

describe('EditStore', () => {
  const directive = editedDirective(range);
  if (directive === undefined) {
    throw new Error('Directives in files can be edited');
  }

  it('shows the attributes that the editor tells, over the saved ones', () => {
    const { store, tell } = createStore();
    tell({ grow: 2, step: true }, { grow: 3, width: 200 });
    expect(
      store.apply({ grow: 2, step: true, heading: 'A' }, directive),
    ).toEqual({ grow: 3, width: 200, heading: 'A' });
  });

  it('shows the props once they are compiled from the edited source', () => {
    const { store, tell } = createStore();
    tell({ grow: 2 }, { grow: 3 });
    expect(store.apply({ grow: 3 }, directive)).toEqual({ grow: 3 });
    expect(store.apply({ grow: 4 }, directive)).toEqual({ grow: 4 });
  });

  it('shows previews until the editor tells about their edits', () => {
    const { store, sent, tell } = createStore();
    store.preview(directive, { grow: 3, width: null });
    expect(store.apply({ grow: 2, width: 100 }, directive)).toEqual({
      grow: 3,
    });
    store.commit([directive]);
    expect(sent).toEqual([
      [
        'editAttributes',
        { version: 1, edits: [{ range, changes: { grow: 3, width: null } }] },
      ],
    ]);
    expect(store.apply({ grow: 2 }, directive)).toEqual({ grow: 3 });
    tell({ grow: 2 }, { grow: 5 });
    expect(store.apply({ grow: 2 }, directive)).toEqual({ grow: 5 });
  });

  it('stops showing cancelled previews', () => {
    const { store, sent } = createStore();
    store.preview(directive, { grow: 3 });
    store.cancel([directive]);
    store.commit([directive]);
    expect(store.apply({ grow: 2 }, directive)).toEqual({ grow: 2 });
    expect(sent).toEqual([]);
  });
});
