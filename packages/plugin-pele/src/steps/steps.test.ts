import { parse, render } from 'pele';
import { VFile } from 'vfile';
import { describe, expect, it } from 'vitest';

import type { DiagramStep } from '../Diagram.tsx';
import { findSteps } from './index.ts';

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

/** The ids of the elements of a diagram. */
function elementIds(source: string): Set<string> {
  return new Set(
    [...render(source).svg.matchAll(/ data-id="([^"]*)"/g)].map(
      ([, id]) => id ?? '',
    ),
  );
}

/** All the items of the steps, nested or not. */
function allItems(steps: readonly DiagramStep[]): string[] {
  return steps.flatMap(({ items, steps: nested = [] }) => [
    ...items,
    ...allItems(nested),
  ]);
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
    expect(stepsOf('pie\n  %% step\n  "a": 1').messages).toEqual([
      "1: Steps of items aren't supported in diagrams of the type `pie`",
    ]);
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

  it('steps the states and transitions of state diagrams', () => {
    const source = [
      'stateDiagram-v2',
      '  [*] --> Idle',
      '  %% step',
      '  Idle --> Active: go',
      '  %% step',
      '  state Active {',
      '    [*] --> Running',
      '    %% step',
      '    Running --> Paused',
      '  }',
      '  Active --> [*]',
    ].join('\n');
    const { steps, messages } = stepsOf(source);
    expect(messages).toEqual([]);
    expect(itemsOf(steps)).toEqual([
      ['edge1'],
      [
        ['Active', 'Active_start', 'Running', 'Paused', 'edge2', 'edge4'],
        [['edge3']],
      ],
    ]);
    const ids = elementIds(source);
    expect(allItems(steps).filter((id) => !ids.has(id))).toEqual([]);
    expect(steps[0]?.props?.['title']).toBe('go');
  });

  it('steps the participants, messages, and blocks of sequence diagrams', () => {
    const source = [
      'sequenceDiagram',
      '  participant A',
      '  %% step',
      '  participant B',
      '  A->>B: one',
      '  %% step',
      '  loop again',
      '    B->>A: two',
      '    %% step',
      '    A->>B: three',
      '  end',
      '  %% step',
      '  Note over A: done',
    ].join('\n');
    const { steps, messages } = stepsOf(source);
    expect(messages).toEqual([]);
    expect(itemsOf(steps)).toEqual([
      ['B', 'i0'],
      [['i1', 'i2'], [['i3']]],
      ['i5'],
    ]);
    // The frames of blocks get their ids when diagrams are rendered.
    const ids = elementIds(source);
    expect(allItems(steps).filter((id) => !ids.has(id))).toEqual(['i1']);
  });

  it('steps participants in their shape data', () => {
    const { steps, messages } = stepsOf(
      'sequenceDiagram\n  participant A\n  participant B@{ "type": "boundary", "step": "only" }\n  A->>B: Hi',
    );
    expect(messages).toEqual([]);
    expect(itemsOf(steps)).toEqual([['B', 'i0']]);
    expect(steps[0]?.props).toMatchObject({ only: '' });
  });

  it('steps the nodes of mind maps with the nodes under them', () => {
    const source = [
      'mindmap',
      '  root((Compilers))',
      '    %% step',
      '    Front',
      '      Lexing',
      '      ::icon(fa fa-book)',
      '      %% step',
      '      Parsing',
      '    %% step',
      '    Back',
    ].join('\n');
    const { steps, messages } = stepsOf(source);
    expect(messages).toEqual([]);
    expect(itemsOf(steps)).toEqual([
      [['Front', 'Lexing'], [['Parsing']]],
      ['Back'],
    ]);
    expect(
      stepsOf(
        'mindmap\n  root\n    A\n      Examples\n    B\n      %% step\n      Examples',
      ).messages,
    ).toEqual([
      '5: Several items are called `Examples`, give them ids to step them',
    ]);
  });

  it('steps the columns and cards of kanban boards', () => {
    const source = [
      'kanban',
      '  todo[Todo]',
      '    t1[Write]',
      '    t2[Test]@{ step }',
      '  %% step',
      '  done[Done]',
      '    t3[Ship]',
    ].join('\n');
    const { steps, messages } = stepsOf(source);
    expect(messages).toEqual([]);
    expect(itemsOf(steps)).toEqual([['t2'], ['done', 't3']]);
  });
  it('steps the classes, notes, and relations of class diagrams', () => {
    const source = [
      'classDiagram',
      '  class Shape',
      '  %% step',
      '  namespace Round {',
      '    class Circle {',
      '      %% step',
      '      +radius: float',
      '    }',
      '    %% step',
      '    class Ellipse',
      '  }',
      '  %% step',
      '  Shape <|-- Circle : extends',
      '  Shape <|-- Ellipse',
      '  %% step',
      '  Shape <|-- Circle',
      '  %% step',
      '  note for Shape "abstract"',
      '  %% step',
      '  Circle : +area() float',
    ].join('\n');
    const { steps, messages } = stepsOf(source);
    expect(messages).toEqual([
      '5: Cannot tell what the step is about, list its items like `%% step[A, A->B]`',
      '18: Cannot tell what the step is about, list its items like `%% step[A, A->B]`',
    ]);
    expect(itemsOf(steps)).toEqual([
      [['Round', 'Circle'], [['Ellipse', 'id_Shape_Ellipse_2']]],
      ['id_Shape_Circle_1'],
      ['id_Shape_Circle_3'],
      ['note0', 'edgeNote0'],
    ]);
    const ids = elementIds(source);
    expect(allItems(steps).filter((id) => !ids.has(id))).toEqual([]);
    expect(steps[1]?.props?.['title']).toBe('extends');
    const nested =
      'classDiagram\n  namespace A {\n    %% step\n    namespace B {\n      class X\n    }\n  }';
    expect(itemsOf(stepsOf(nested).steps)).toEqual([['A.B', 'X']]);
    expect(elementIds(nested)).toContain('A.B');
  });

  it('steps the entities and relationships of entity relationship diagrams', () => {
    const source = [
      'erDiagram',
      '  CUSTOMER ||--o{ ORDER : places',
      '  %% step',
      '  subgraph Shipping',
      '    %% step',
      '    ORDER ||--|{ ITEM : contains',
      '  end',
      '  %% step',
      '  CUSTOMER ||--o{ ORDER : returns',
      '  %% step',
      '  p[Person] {',
      '    string name',
      '  }',
    ].join('\n');
    const { steps, messages } = stepsOf(source);
    expect(messages).toEqual([]);
    expect(itemsOf(steps)).toEqual([
      // Entities in the subgraph are in its step, and so is the relationship
      // before it, which is shown with `ORDER`.
      [
        ['ORDER', 'ITEM', 'Shipping', 'id_entity-CUSTOMER-0_entity-ORDER-1_0'],
        [['id_entity-ORDER-1_entity-ITEM-2_1']],
      ],
      ['id_entity-CUSTOMER-0_entity-ORDER-1_2'],
      ['p'],
    ]);
    const ids = elementIds(source);
    expect(allItems(steps).filter((id) => !ids.has(id))).toEqual([]);
    expect(steps[2]?.props?.['title']).toBe('Person');
  });
  it('steps the services, groups, and edges of architecture diagrams', () => {
    const source = [
      'architecture-beta',
      '  service web(internet)[Web]',
      '  %% step',
      '  group api(cloud)[API]',
      '  service server(server)[Server] in api',
      '  %% step',
      '  service db(database)[Database] in api',
      '  web:R -- L:server',
      '  %% step',
      '  server:R -- L:db',
    ].join('\n');
    const { steps, messages } = stepsOf(source);
    expect(messages).toEqual([]);
    expect(itemsOf(steps)).toEqual([
      // The edge between services in the group is in the step of the group.
      [
        ['api', 'server', 'web-server'],
        [['db'], ['server-db']],
      ],
    ]);
    const ids = elementIds(source);
    expect(allItems(steps).filter((id) => !ids.has(id))).toEqual([]);
  });

  it('steps the requirements and relations of requirement diagrams', () => {
    const source = [
      'requirementDiagram',
      '  requirement fast {',
      '    id: 1',
      '    text: be fast',
      '  }',
      '  %% step',
      '  element cache {',
      '    type: module',
      '  }',
      '  %% step',
      '  cache - satisfies -> fast',
      '  %% step',
      '  cache - verifies -> fast',
    ].join('\n');
    const { steps, messages } = stepsOf(source);
    expect(messages).toEqual([]);
    expect(itemsOf(steps)).toEqual([
      ['cache'],
      ['cache-fast-0'],
      ['cache-fast-1'],
    ]);
    const ids = elementIds(source);
    expect(allItems(steps).filter((id) => !ids.has(id))).toEqual([]);
  });

  it('steps the elements, boundaries, and relations of C4 diagrams', () => {
    const source = [
      'C4Context',
      '  Person(customer, "Customer")',
      '  %% step',
      '  Enterprise_Boundary(bank, "Bank") {',
      '    System(core, "Core")',
      '    %% step',
      '    SystemDb(db, "Ledger")',
      '  }',
      '  Rel(customer, core, "Uses")',
      '  %% step',
      '  Rel(core, db, "Reads")',
    ].join('\n');
    const { steps, messages } = stepsOf(source);
    expect(messages).toEqual([]);
    expect(itemsOf(steps)).toEqual([
      [
        ['bank', 'core', 'customer-core'],
        [['db'], ['core-db']],
      ],
    ]);
    const ids = elementIds(source);
    expect(allItems(steps).filter((id) => !ids.has(id))).toEqual([]);
  });

  it('steps the blocks and edges of block diagrams', () => {
    const source = [
      'block-beta',
      '  columns 3',
      '  a["Source"] b',
      '  %% step',
      '  block',
      '    c',
      '    %% step',
      '    d',
      '  end',
      '  a --> b',
      '  %% step',
      '  a --> b',
      '  %% step',
      '  b --> e["Sink"]',
    ].join('\n');
    const { steps, messages } = stepsOf(source);
    expect(messages).toEqual([]);
    expect(itemsOf(steps)).toEqual([
      [['id-1', 'c'], [['d']]],
      ['2-a-b'],
      ['e', '1-b-e'],
    ]);
    const ids = elementIds(source);
    expect(allItems(steps).filter((id) => !ids.has(id))).toEqual([]);
  });
});
