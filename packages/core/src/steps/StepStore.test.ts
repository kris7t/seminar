import { afterEach, describe, expect, it } from 'vitest';

import { StepNode, type StepOptions } from './StepNode.ts';
import { StepStore } from './StepStore.ts';
import type { StepTreeEntry } from './stepTree.ts';

/** Summarizes a tree of steps as `path label` lines, indented by level. */
function summarize(entries: readonly StepTreeEntry[], indent = ''): string[] {
  return entries.flatMap(({ path, label, children }) => [
    `${indent}${path.join('.')} ${label}`,
    ...summarize(children, `${indent}  `),
  ]);
}

/**
 * Adds a stepper with the text `text` to `store`, in an element appended to
 * `inside`.
 */
function addStep(
  store: StepStore,
  text: string,
  {
    inside = document.body,
    group,
    ...options
  }: Partial<StepOptions> & { inside?: Element; group?: string } = {},
): HTMLElement {
  const element = document.createElement('div');
  element.append(text);
  inside.append(element);
  store.attach(
    group === undefined ? new StepNode() : store.getGroup(group),
    element,
    {
      count: 1,
      placement: 'next',
      ...options,
    },
  );
  return element;
}

describe('StepStore', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('labels steps with their titles', () => {
    const store = new StepStore();
    const a = addStep(store, 'Long text', { title: 'Short' });
    addStep(store, 'Nested', { inside: a });
    addStep(store, 'Figure', { title: 'Figure', count: 2 });
    expect(summarize(store.getTree())).toEqual([
      '1 Short',
      '  1.1 Nested',
      '2 Figure (1/2)',
      '3 Figure (2/2)',
    ]);
  });

  it('places steps right after a group', () => {
    const store = new StepStore();
    const a = addStep(store, 'A', { group: 'a' });
    addStep(store, 'A.1', { inside: a });
    addStep(store, 'B');
    addStep(store, 'X', { after: 'a' });
    addStep(store, 'Y', { after: 'a', group: 'y' });
    addStep(store, 'Z');
    // Right after Y, which is after A.
    addStep(store, 'W', { after: 'y' });
    expect(summarize(store.getTree())).toEqual([
      '1 A',
      '  1.1 A.1',
      '2 X',
      '3 Y',
      '4 W',
      '5 B',
      '6 Z',
    ]);
  });

  it('places steps after a group in the stepper of the group', () => {
    const store = new StepStore();
    const p = addStep(store, 'P');
    addStep(store, 'Q', { inside: p, group: 'q' });
    addStep(store, 'R', { inside: p });
    // Before the group in document order, and inside another step.
    const s = addStep(store, 'S');
    document.body.prepend(s);
    addStep(store, 'T', { after: 'q', inside: s });
    expect(summarize(store.getTree())).toEqual([
      '1 S',
      '2 P',
      '  2.1 Q',
      '  2.2 T',
      '  2.3 R',
    ]);
  });

  it('places steps after groups that are after each other by their elements', () => {
    const store = new StepStore();
    addStep(store, 'A', { group: 'a', after: 'b' });
    addStep(store, 'B', { group: 'b', after: 'a' });
    addStep(store, 'C');
    expect(summarize(store.getTree())).toEqual(['1 A', '2 B', '3 C']);
  });

  describe('placing steps around content that is not a step', () => {
    const JOINS = {
      placement: 'next',
      defaultPlacement: 'content',
      joins: true,
      stepless: true,
    } as const;

    it('nests a group in the step around its first element', () => {
      const store = new StepStore();
      const a = addStep(store, 'A');
      addStep(store, 'G1', { inside: a, group: 'g' });
      addStep(store, 'B');
      addStep(store, 'G2', { group: 'g' });
      expect(summarize(store.getTree())).toEqual(['1 A', '  1.1 G1 G2', '2 B']);
    });

    it('places a group at its first element in content', () => {
      const store = new StepStore();
      const text = addStep(store, 'Text', JOINS);
      addStep(store, 'G1', { inside: text, group: 'g' });
      addStep(store, 'B');
      addStep(store, 'G2', { group: 'g' });
      expect(summarize(store.getTree())).toEqual(['1 G1 G2', '2 B']);
    });

    it('labels a step with the content inside it', () => {
      const store = new StepStore();
      const a = addStep(store, '', {});
      addStep(store, 'Text', { ...JOINS, inside: a });
      expect(summarize(store.getTree())).toEqual(['1 Text']);
    });

    it('labels a step without the content of the steps inside it', () => {
      const store = new StepStore();
      const a = addStep(store, 'A');
      addStep(store, 'B', { inside: a });
      addStep(store, 'Part of B', { ...JOINS, inside: a });
      expect(summarize(store.getTree())).toEqual([
        '1 A',
        '  1.1 B · Part of B',
      ]);
    });

    it.each(['previous', 'content'] as const)(
      'joins what encloses content with %s after with="parent"',
      (placement) => {
        const store = new StepStore();
        addStep(store, 'A');
        addStep(store, 'B', { placement: 'parent', joins: true });
        addStep(store, 'C', { placement, joins: true });
        addStep(store, 'D');
        expect(summarize(store.getTree())).toEqual(['1 A', '2 D']);
      },
    );

    it.each(['previous', 'content'] as const)(
      'makes a step 0 with %s after with="parent" for a look of its own',
      (placement) => {
        const store = new StepStore();
        addStep(store, 'A');
        addStep(store, 'B', { placement: 'parent', joins: true });
        addStep(store, 'C', { placement });
        expect(summarize(store.getTree())).toEqual(['0 C', '1 A']);
      },
    );

    it('joins the step before an overlay with="parent"', () => {
      const store = new StepStore();
      addStep(store, 'A');
      addStep(store, 'B', { placement: 'parent', joins: true, overlay: true });
      addStep(store, 'C', JOINS);
      expect(summarize(store.getTree())).toEqual(['1 A · C']);
    });

    it('makes a group with="parent" a name for what encloses it', () => {
      const store = new StepStore();
      const a = addStep(store, 'A');
      addStep(store, 'B', {
        inside: a,
        group: 'g',
        placement: 'parent',
        joins: true,
      });
      addStep(store, 'C', { inside: a, group: 'g' });
      addStep(store, 'D', { parent: 'g' });
      expect(summarize(store.getTree())).toEqual(['1 ABC', '  1.1 D']);
    });
  });
});
