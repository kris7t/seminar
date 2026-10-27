import { parse, render } from 'pele';
import { register } from 'pele/core';
import sequence from 'pele/diagrams/sequence';
import { VFile } from 'vfile';
import { describe, expect, it } from 'vitest';

import { annotate } from '../annotate.ts';
import type { DiagramStep } from '../Diagram.tsx';
import { findSteps } from './index.ts';

// For the annotations of sequence diagrams.
register(sequence);

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

/** The ids of the elements of a diagram, as the DOM has them. */
function elementIds(source: string): Set<string> {
  const { svg: rendered, type } = render(source);
  const svg = new DOMParser().parseFromString(
    annotate(rendered, type, source),
    'image/svg+xml',
  );
  return new Set(
    [...svg.querySelectorAll('[data-id]')].map(
      (element) => element.getAttribute('data-id') ?? '',
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
    expect(stepsOf('info\n  %% step\n  showInfo').messages).toEqual([
      "1: Steps of items aren't supported in diagrams of the type `info`",
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
    const ids = elementIds(source);
    expect(allItems(steps).filter((id) => !ids.has(id))).toEqual([]);
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
  it.each([
    {
      type: 'pie charts',
      source: ['pie', '  "Dogs" : 386', '  %% step', '  "Cats" : 85'],
      steps: [['Cats']],
    },
    {
      type: 'timelines',
      source: [
        'timeline',
        '  title History',
        '  section Early',
        '    2002 : LinkedIn',
        '    %% step',
        '    2004 : Facebook',
        '         : Google',
        '  %% step',
        '  section Late',
        '    2006 : Twitter',
      ],
      steps: [['2004'], ['Late', '2006']],
    },
    {
      type: 'timelines without sections',
      source: [
        'timeline',
        '  2002 : LinkedIn',
        '  %% step',
        '  2004 : Facebook',
      ],
      steps: [['2004']],
    },
    {
      type: 'user journeys without sections',
      source: ['journey', '  Tea: 5: Me', '  %% step', '  Code: 3: Me'],
      steps: [['Code']],
    },
    {
      type: 'Gantt charts without sections',
      source: [
        'gantt',
        '  dateFormat YYYY-MM-DD',
        '  Design :a1, 2024-01-01, 3d',
        '  %% step',
        '  Code :after a1, 2d',
      ],
      steps: [['task1']],
    },
    {
      type: 'user journeys',
      source: [
        'journey',
        '  section Work',
        '    Make tea: 5: Me',
        '    %% step',
        '    Code: 3: Me, Cat',
        '  %% step',
        '  section Home',
        '    Sleep: 5: Me',
      ],
      steps: [['Code'], ['Home', 'Sleep']],
    },
    {
      type: 'quadrant charts',
      source: [
        'quadrantChart',
        '  x-axis Low --> High',
        '  A: [0.3, 0.6]',
        '  %% step',
        '  B: [0.7, 0.2]',
      ],
      steps: [['B']],
    },
    {
      type: 'Gantt charts',
      source: [
        'gantt',
        '  dateFormat YYYY-MM-DD',
        '  section Build',
        '    Design :a1, 2024-01-01, 3d',
        '    %% step',
        '    Code :after a1, 2d',
        '  %% step',
        '  section Ship',
        '    Release :milestone, m1, 2024-01-06, 0d',
      ],
      steps: [['task1'], ['Ship', 'm1']],
    },
    {
      type: 'packet diagrams',
      source: [
        'packet-beta',
        '  0-15: "Source"',
        '  %% step',
        '  16-31: "Destination"',
        '  %% step',
        '  +8: "Flags"',
      ],
      steps: [['16-31'], ['32-39']],
    },
    {
      type: 'radar charts',
      source: [
        'radar-beta',
        '  axis a, b, c',
        '  curve x{1, 2, 3}',
        '  %% step',
        '  curve y["Why"]{3, 2, 1}, z{2, 2, 2}',
      ],
      steps: [['y', 'z']],
    },
    {
      type: 'treemaps',
      source: [
        'treemap-beta',
        '  "Root"',
        '    "A"',
        '      "A1": 10',
        '    %% step',
        '    "B"',
        '      "B1": 5',
      ],
      steps: [['B', 'B1']],
    },
    {
      type: 'Sankey diagrams',
      source: [
        'sankey-beta',
        '  A,B,10',
        '  %% step',
        '  A,C,5',
        '  %% step',
        '  B,C,7',
      ],
      steps: [['C', 'A->C'], ['B->C']],
    },
    {
      type: 'git graphs',
      source: [
        'gitGraph',
        '  commit id: "init"',
        '  %% step',
        '  branch dev',
        '  commit id: "work"',
        '  checkout main',
        '  %% step',
        '  merge dev id: "merged"',
      ],
      steps: [['dev', 'work'], ['merged']],
    },
    {
      type: 'XY charts',
      source: [
        'xychart',
        '  x-axis [jan, feb, mar]',
        '  bar [1, 2, 3]',
        '  %% step',
        '  line [3, 2, 1]',
      ],
      steps: [['series-2']],
    },
    {
      type: 'swimlanes',
      source: [
        'swimlane-beta LR',
        '  subgraph Customer',
        '    request[Request]',
        '  end',
        '  %% step',
        '  subgraph Support',
        '    triage[Triage]',
        '  end',
        '  request --> triage',
      ],
      steps: [['triage', 'Support', 'L_request_triage_0']],
    },
    {
      type: 'agent workflows',
      source: [
        'agentflow-beta TB',
        '  flow intake["Intake"]',
        '    receive["Receive"]@{ shape: input }',
        '  end',
        '  %% step',
        '  validate["Validate"]@{ shape: task }',
        '  receive --> validate',
      ],
      steps: [['validate', 'L_receive_validate_0']],
    },
    {
      type: 'tree views',
      source: [
        'treeView-beta',
        '  project/',
        '    %% step',
        '    src/',
        '      index.js ## entry point',
        '    package.json',
      ],
      steps: [['src', 'index.js']],
    },
    {
      type: 'Ishikawa diagrams',
      source: [
        'ishikawa-beta',
        '  Blurry Photo',
        '  Process',
        '    Out of focus',
        '  %% step',
        '  Equipment',
        '    Dirty lens',
      ],
      steps: [['Equipment']],
    },
    {
      type: 'Cynefin diagrams',
      source: [
        'cynefin-beta',
        '  complex',
        '    "Market research"',
        '    %% step',
        '    "Experiments"',
        '  %% step',
        '  complicated',
        '    "Analysis"',
        '  %% step',
        '  complex --> complicated : "Pattern"',
      ],
      steps: [
        ['Experiments'],
        ['complicated', 'Analysis'],
        ['complex-complicated'],
      ],
    },
    {
      type: 'Wardley maps',
      source: [
        'wardley-beta',
        '  anchor Business [0.95, 0.63]',
        '  %% step',
        '  component Cup of Tea [0.79, 0.61]',
        '  component Kettle [0.43, 0.35]',
        '  Business -> Cup of Tea',
        '  %% step',
        '  Cup of Tea -> Kettle',
        '  evolve Kettle 0.62',
      ],
      steps: [['Cup of Tea', 'Business-Cup of Tea'], ['Cup of Tea-Kettle']],
    },
    {
      type: 'event models',
      source: [
        'eventmodeling',
        '  timeframe 01 ui CartUI',
        '  %% step',
        '  timeframe 02 command AddItem',
        '  timeframe 03 event ItemAdded',
      ],
      // `03` is shown with the diagram, so the relation to it is shown with `02`.
      steps: [['02', '01-02', '02-03']],
    },
    {
      type: 'Venn diagrams',
      source: [
        'venn-beta',
        '  set Desirable',
        '  set Feasible',
        '  %% step',
        '  union Desirable,Feasible["Buildable"]',
      ],
      steps: [['Desirable|Feasible']],
    },
    {
      type: 'railroad diagrams',
      source: [
        'railroad-ebnf-beta',
        '  expression = term ( "+" term )* ;',
        '  %% step',
        '  term = "x" | "(" expression ")" ;',
      ],
      steps: [['term']],
    },
    {
      type: 'use case diagrams',
      source: [
        'usecase-beta',
        '  actor Customer',
        '  systemBoundary Store',
        '    Browse("Browse catalog")',
        '    %% step',
        '    Checkout("Checkout")',
        '  end',
        '  Customer --> Browse',
        '  %% step',
        '  Customer --> Checkout',
      ],
      steps: [['Checkout'], ['edge-1']],
    },
  ])('steps the items of $type', ({ source: lines, steps: expected }) => {
    const source = lines.join('\n');
    const { steps, messages } = stepsOf(source);
    expect(messages).toEqual([]);
    expect(itemsOf(steps)).toEqual(expected);
    const ids = elementIds(source);
    expect(allItems(steps).filter((id) => !ids.has(id))).toEqual([]);
  });
});
