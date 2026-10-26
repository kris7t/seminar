import { register, render } from 'pele/core';
import sequence from 'pele/diagrams/sequence';
import { describe, expect, it } from 'vitest';

import { annotate } from './annotate.ts';

register(sequence);

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
});
