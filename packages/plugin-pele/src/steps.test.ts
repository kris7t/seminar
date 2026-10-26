import { parse } from 'pele';
import { VFile } from 'vfile';
import { describe, expect, it } from 'vitest';

import type { DiagramStep } from './Diagram.tsx';
import { findSteps } from './steps.ts';

function stepsOf(source: string): {
  steps: DiagramStep[];
  messages: string[];
} {
  const messages: string[] = [];
  const steps = findSteps(source, new VFile(), (message, line) => {
    messages.push(`${String(line)}: ${message}`);
  });
  return { steps, messages };
}

/** The items of the steps, with the nested ones in brackets. */
function itemsOf(steps: readonly DiagramStep[]): unknown[] {
  return steps.map(({ items, steps: nested = [] }) =>
    nested.length === 0 ? [...items] : [[...items], itemsOf(nested)],
  );
}

describe('findSteps', () => {
  it('steps what the statement after a comment is about', () => {
    const { steps, messages } = stepsOf(
      'flowchart LR\n  A --> B\n  %% step\n  B[Parser] --> C',
    );
    expect(messages).toEqual([]);
    // `C` is only named, so it's shown with the diagram.
    // The edge from `A` is shown with `B`, the later of its ends.
    expect(itemsOf(steps)).toEqual([['B', 'L_A_B_0', 'L_B_C_0']]);
    expect(steps[0]?.props).toEqual({ title: 'Parser, B → C' });
  });

  it('steps the items in brackets', () => {
    const { steps } = stepsOf(
      'flowchart LR\n  A --> B\n  B --> C\n  %% step[C, B->C] only',
    );
    expect(itemsOf(steps)).toEqual([['C', 'L_B_C_0']]);
    expect(steps[0]?.props).toMatchObject({ only: '' });
  });

  it('steps nodes and edges in their shape data', () => {
    const { steps } = stepsOf(
      'flowchart LR\n  A --> B[Parser]@{ step: "group=emit" }\n  A e1@--> C\n  e1@{ step }',
    );
    // `C` is only named, so it's shown with the diagram.
    expect(itemsOf(steps)).toEqual([['B', 'L_A_B_0'], ['e1']]);
    expect(steps[0]?.props).toMatchObject({ group: 'emit' });
  });

  it('shows edges with the later of their ends', () => {
    const { steps } = stepsOf(
      'flowchart LR\n  %% step\n  A[Lexer]\n  %% step\n  B[Parser]\n  A --> B',
    );
    expect(itemsOf(steps)).toEqual([['A'], ['B', 'L_A_B_0']]);
  });

  it('nests steps in the steps of their subgraphs', () => {
    const { steps } = stepsOf(
      [
        'flowchart LR',
        '  %% step',
        '  subgraph FE [Front end]',
        '    A[Lexer]',
        '    %% step',
        '    B[Parser]',
        '  end',
      ].join('\n'),
    );
    expect(itemsOf(steps)).toEqual([[['A', 'FE'], [['B']]]]);
  });

  it('tells repeated edges apart', () => {
    const source = 'flowchart LR\n  A --> B\n  %% step\n  A --> B';
    const { steps } = stepsOf(source);
    const model = parse(source);
    const second = model.type === 'flowchart' ? model.edges[1]?.id : undefined;
    expect(itemsOf(steps)).toEqual([[second]]);
  });

  it('reports items that cannot be stepped', () => {
    expect(stepsOf('flowchart LR\n  A --> B\n  %% step[C]').messages).toEqual([
      '2: The diagram has no `C` to step',
    ]);
    expect(
      stepsOf('flowchart LR\n  %% step\n  A[Lexer]\n  %% step[A]').messages,
    ).toEqual(['3: `A` is already shown in an earlier step']);
    expect(stepsOf('flowchart LR\n  %% step\n  A\n').messages).toEqual([
      '1: Cannot tell what the step is about, list its items like `%% step[A, A->B]`',
    ]);
    expect(stepsOf('sequenceDiagram\n  %% step\n  A->>B: Hi').messages).toEqual(
      ['1: Steps of items are only supported in flowcharts'],
    );
  });

  it('reports edges shown before both of their ends', () => {
    const { messages } = stepsOf(
      'flowchart LR\n  %% step\n  A --> B\n  %% step\n  A[Lexer]\n  %% step\n  B[Parser]',
    );
    expect(messages).toEqual([
      '1: The edge `L_A_B_0` is shown before both of its ends',
    ]);
  });

  it('skips the frontmatter of diagrams', () => {
    const { steps } = stepsOf(
      '---\nconfig:\n  look: classic\n---\nflowchart LR\n  %% step\n  A[Lexer]',
    );
    expect(itemsOf(steps)).toEqual([['A']]);
  });
});
