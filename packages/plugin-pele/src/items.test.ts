import { render } from 'pele';
import { describe, expect, it } from 'vitest';

import { findItems } from './items.ts';

function itemsOf(source: string): Map<string, Element> {
  const root = document.createElement('div');
  root.innerHTML = render(source).svg;
  return findItems(root);
}

const classOf = (element: Element | undefined) =>
  element?.getAttribute('class');

describe('findItems', () => {
  it('finds the nodes, clusters, and edges of a diagram by their ids', () => {
    const items = itemsOf(
      'flowchart LR\n  subgraph S [Group]\n    A\n  end\n  A e1@-->|label| B',
    );
    expect(classOf(items.get('A'))).toMatch(/\bpele-node\b/);
    expect(classOf(items.get('S'))).toMatch(/\bpele-cluster\b/);
    // The edge rather than its label.
    expect(classOf(items.get('e1'))).toMatch(/^pele-edge\b/);
  });

  it('finds the participants of sequence diagrams at the top', () => {
    const items = itemsOf('sequenceDiagram\n  A->>B: Hi');
    const participant = items.get('A');
    expect(classOf(participant)).toMatch(/\bpele-actor-participant\b/);
    expect(classOf(participant)).not.toMatch(/\bpele-actor-footer\b/);
  });
});
