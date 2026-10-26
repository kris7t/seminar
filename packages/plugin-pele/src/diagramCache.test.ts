import { render } from 'pele';
import { describe, expect, it } from 'vitest';

import { ID_PLACEHOLDER, joinIds, splitIds } from './diagramCache.ts';

function idsOf(svg: string): { ids: string[]; references: string[] } {
  return {
    ids: [...svg.matchAll(/ id="([^"]*)"/g)].map(([, id]) => id ?? ''),
    references: [
      ...svg.matchAll(
        /url\(#([^)]*)\)|aria-(?:labelledby|describedby)="([^"]*)"/g,
      ),
    ].map(([, url, aria]) => url ?? aria ?? ''),
  };
}

describe('splitIds', () => {
  it('gives the ids of each rendering a prefix of its own', () => {
    // Titles for assistive technology, and gradients of flows.
    const svg = [
      'flowchart LR\n  accTitle: Steps\n  accDescr: From A to B\n  A --> B',
      'sankey-beta\na,b,3\nb,c,2',
    ]
      .map((source) => render(source, { idPrefix: ID_PLACEHOLDER }).svg)
      .join('');
    const diagram = { parts: splitIds(svg) };
    const first = idsOf(joinIds(diagram, 'one'));
    const second = idsOf(joinIds(diagram, 'two'));
    expect(first.ids).toContain('one-title');
    expect(first.ids).toContain('one-desc');
    expect(first.ids.some((id) => id.startsWith('one-sankey-'))).toBe(true);
    expect(first.ids.every((id) => id.startsWith('one-'))).toBe(true);
    expect(first.references.every((id) => first.ids.includes(id))).toBe(true);
    expect(second.ids).toEqual(
      first.ids.map((id) => id.replace(/^one/, 'two')),
    );
  });

  it('leaves text that happens to look like the ids alone', () => {
    const label = `${ID_PLACEHOLDER}-title`;
    const { svg } = render(`flowchart LR\n  A["${label}"]`, {
      idPrefix: ID_PLACEHOLDER,
    });
    expect(joinIds({ parts: splitIds(svg) }, 'one')).toContain(`>${label}<`);
  });
});
