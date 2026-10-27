import { register, render } from 'pele/core';
import railroad from 'pele/diagrams/railroad';
import sequence from 'pele/diagrams/sequence';
import xychart from 'pele/diagrams/xychart';
import { describe, expect, it } from 'vitest';

import { annotate } from './annotate.ts';

register(railroad);
register(sequence);
register(xychart);

describe('annotate', () => {
  it('gives the frames of blocks the ids of the statements that start them', () => {
    const source = [
      'sequenceDiagram',
      '  A->>B: zero',
      '  loop outer',
      '    opt inner',
      '      A->>B: one',
      '    end',
      '  end',
      '  rect rgb(0, 0, 0)',
      '    A->>B: two',
      '  end',
      '  alt yes',
      '    A->>B: three',
      '  else no',
      '    B->>A: four',
      '  end',
    ].join('\n');
    const { svg, type } = render(source);
    const frames = [
      ...annotate(svg, type, source).matchAll(
        /<g data-id="([^"]*)" class="pele-frame pele-frame-(\w+)"/g,
      ),
    ].map(([, id, kind]) => `${kind ?? ''} ${id ?? ''}`);
    // Statements are numbered from 0, and blocks without frames, like
    // `rect`, take numbers, too.
    expect(frames.sort()).toEqual(['alt i9', 'loop i1', 'opt i2']);
  });

  it('gives the series of XY charts ids by their order', () => {
    const source = 'xychart\n  x-axis [a, b]\n  bar [1, 2]\n  line [2, 1]';
    const { svg, type } = render(source);
    expect(
      [
        ...annotate(svg, type, source).matchAll(
          /<g data-id="([^"]*)" class="pele-series pele-(\w+)"/g,
        ),
      ].map(([, id, kind]) => `${kind ?? ''} ${id ?? ''}`),
    ).toEqual(['bars series-1', 'line series-2']);
  });

  it('leaves the ids of railroad rules only on the rules', () => {
    const source = 'railroad-ebnf-beta\n  a = b "x" ;\n  b = "y" ;';
    const { svg, type } = render(source);
    const annotated = annotate(svg, type, source);
    expect(
      [...annotated.matchAll(/ data-id="([^"]*)"/g)].map(([, id]) => id),
    ).toEqual(['a', 'b']);
    expect(annotated).toContain(
      '<g class="pele-node pele-nonterminal" data-rule="b"',
    );
  });
});
