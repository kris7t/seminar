import { describe, expect, it, vi } from 'vitest';

import { StateStore } from './StateStore.ts';

const A = {};
const B = {};

describe('StateStore', () => {
  it('stores values by owner, family, and key', () => {
    const store = new StateStore();
    const listener = vi.fn();
    store.subscribe(0, A, 'a', listener);
    expect(store.getOrInit(0, A, 'a', () => 1)).toBe(1);
    expect(store.getOrInit(0, A, 'a', () => 2)).toBe(1);
    expect(listener).not.toHaveBeenCalled();
    store.set(0, A, 'a', 3);
    store.set(1, A, 'a', 4);
    store.set(0, B, 'a', 5);
    store.set('deck', A, 'a', 6);
    expect(listener).toHaveBeenCalledOnce();
    expect(store.get(0, A, 'a')).toBe(3);
    expect(store.get(1, A, 'a')).toBe(4);
    expect(store.get(0, B, 'a')).toBe(5);
    expect(store.get('deck', A, 'a')).toBe(6);
    expect(store.has(0, A, 'b')).toBe(false);
  });

  it('reports changes without counting initialization or unchanged writes', () => {
    const store = new StateStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribeChanges(listener);
    store.getOrInit(0, A, 'a', () => 1);
    store.set('deck', A, 'unset', undefined);
    expect(listener).not.toHaveBeenCalled();
    store.set(0, A, 'a', 2);
    store.set(0, A, 'a', 2);
    store.set('deck', A, 'b', 3);
    store.reset(0);
    store.reset(0);
    store.getOrInit(1, A, 'a', () => 1);
    store.resetAll();
    store.resetAll();
    expect(listener.mock.calls).toEqual([
      [[{ owner: 0, family: A, key: 'a' }]],
      [[{ owner: 'deck', family: A, key: 'b' }]],
      [[{ owner: 0, family: A, key: 'a' }]],
      [
        [
          { owner: 'deck', family: A, key: 'b' },
          { owner: 1, family: A, key: 'a' },
        ],
      ],
    ]);
    unsubscribe();
    store.set(0, A, 'a', 4);
    expect(listener).toHaveBeenCalledTimes(4);
  });

  it('tracks and resets changed owners', () => {
    const store = new StateStore();
    const changed = vi.fn();
    store.subscribeChanged(changed);
    store.getOrInit(0, A, 'a', () => 1);
    // Only initialized.
    expect(store.hasState(0)).toBe(true);
    expect(store.hasState(1)).toBe(false);
    expect(store.getChanged().size).toBe(0);
    store.set(0, A, 'a', 2);
    const snapshot = store.getChanged();
    expect([...snapshot]).toEqual([0]);
    store.set(0, A, 'a', 3);
    expect(store.getChanged()).toBe(snapshot);
    expect(changed).toHaveBeenCalledOnce();
    store.set('deck', A, 'a', 1);
    store.set('deck', A, 'a', undefined);
    expect([...store.getChanged()]).toEqual([0, 'deck']);
    const listener = vi.fn();
    store.subscribe(0, A, 'a', listener);
    store.reset(0);
    expect(listener).toHaveBeenCalledOnce();
    expect([...store.getChanged()]).toEqual(['deck']);
    expect(store.hasState(0)).toBe(false);
    expect(store.getOrInit(0, A, 'a', () => 1)).toBe(1);
  });

  it('clears every value on a full reset', () => {
    const store = new StateStore();
    store.getOrInit(0, A, 'a', () => 0);
    store.set(1, A, 'a', 1);
    store.set('deck', B, 'b', 2);
    const value = vi.fn();
    const deck = vi.fn();
    const changed = vi.fn();
    store.subscribe(0, A, 'a', value);
    store.subscribe('deck', B, 'b', deck);
    store.subscribeChanged(changed);
    store.resetAll();
    expect(store.get(0, A, 'a')).toBeUndefined();
    expect(store.get('deck', B, 'b')).toBeUndefined();
    expect(store.getChanged().size).toBe(0);
    expect(value).toHaveBeenCalledOnce();
    expect(deck).toHaveBeenCalledOnce();
    expect(changed).toHaveBeenCalledOnce();
  });

  it('moves the values of slides to other indices, but not of the deck', () => {
    const store = new StateStore();
    store.set(0, A, 'a', 'first');
    store.set(1, A, 'a', 'second');
    store.set('deck', A, 'a', 'deck');
    const moved = vi.fn();
    store.subscribe(2, A, 'a', moved);
    // A slide was added before the second one, and the first was removed.
    store.move([undefined, 2]);
    expect(store.has(0, A, 'a')).toBe(false);
    expect(store.has(1, A, 'a')).toBe(false);
    expect(store.get(2, A, 'a')).toBe('second');
    expect(store.get('deck', A, 'a')).toBe('deck');
    expect([...store.getChanged()].sort()).toEqual([2, 'deck']);
    expect(moved).toHaveBeenCalledOnce();
  });

  it('reports only values that differ after moving', () => {
    const store = new StateStore();
    store.set(0, A, 'a', 'same');
    store.set(1, A, 'a', 'same');
    store.set(1, A, 'b', 'other');
    const listener = vi.fn();
    store.subscribeChanges(listener);
    store.move([0, 1]);
    store.move([1, 0]);
    expect(listener.mock.calls).toEqual([
      [
        [
          { owner: 0, family: A, key: 'b' },
          { owner: 1, family: A, key: 'b' },
        ],
      ],
    ]);
  });
});
