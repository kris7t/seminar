import { describe, expect, it, vi } from 'vitest';

import { StepPositionStore } from './StepPositionStore.ts';
import { StepStore } from './StepStore.ts';

describe('StepPositionStore', () => {
  it('returns the same position for the same slide', () => {
    const store = new StepPositionStore();
    expect(store.stepPosition(0)).toBe(store.stepPosition(0));
    expect(store.stepPosition(0)).not.toBe(store.stepPosition(1));
  });

  it('notifies only the listeners of the changed slide', () => {
    const store = new StepPositionStore();
    const first = vi.fn();
    const second = vi.fn();
    store.stepPosition(0).subscribe(first);
    store.stepPosition(1).subscribe(second);
    const target = { path: [1], toEnd: false };
    store.stepPosition(0).set(target);
    store.stepPosition(0).set(target);
    expect(first).toHaveBeenCalledOnce();
    expect(second).not.toHaveBeenCalled();
    expect(store.stepPosition(0).get()).toBe(target);
  });

  it('restores every saved step target on a full reset', () => {
    const store = new StepPositionStore();
    const position = store.stepPosition(0);
    position.set({ path: [2], toEnd: false, group: 'later', texts: ['old'] });
    store.stepPosition(1).set({ path: [3, 1], toEnd: true });
    const steps = vi.fn();
    position.subscribe(steps);
    store.resetAll();
    expect(store.stepPosition(0)).toBe(position);
    expect(position.get()).toEqual({ path: [], toEnd: false, inRange: true });
    expect(store.stepPosition(1).get()).toEqual(position.get());
    expect(steps).toHaveBeenCalledOnce();
    store.resetAll();
    expect(steps).toHaveBeenCalledOnce();
  });

  it('moves the positions of slides to other indices', () => {
    const store = new StepPositionStore();
    store.stepPosition(0).set({ path: [1], toEnd: false });
    store.stepPosition(1).set({ path: [2], toEnd: false });
    const removed = vi.fn();
    const moved = vi.fn();
    store.stepPosition(0).subscribe(removed);
    store.stepPosition(2).subscribe(moved);
    // A slide was added before the second one, and the first was removed.
    store.move([undefined, 2]);
    expect(store.stepPosition(0).get().path).toEqual([]);
    expect(store.stepPosition(1).get().path).toEqual([]);
    expect(store.stepPosition(2).get().path).toEqual([2]);
    expect(removed).toHaveBeenCalledOnce();
    expect(moved).toHaveBeenCalledOnce();
  });

  it('shares the position in the steps between step stores', () => {
    const position = new StepPositionStore().stepPosition(0);
    const a = new StepStore({ position });
    const b = new StepStore({ position });
    const listener = vi.fn();
    b.subscribe(listener);
    a.reset([], true);
    expect(listener).toHaveBeenCalled();
    expect(b.getPath()).toEqual(a.getPath());
  });
});
