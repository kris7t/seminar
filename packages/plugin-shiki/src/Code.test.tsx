import { render, screen } from '@testing-library/react';
import { Deck, DeckDocument, Slide } from '@seminar/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Code, codeClasses } from './Code.tsx';

describe('Code', () => {
  it('shows the highlighted code with the previous step', () => {
    render(
      <Deck>
        <Slide title="Code">
          <Code lang="ts" code="let x;">
            <pre>
              <code>let x;</code>
            </pre>
          </Code>
        </Slide>
      </Deck>,
    );
    const code = screen.getByText('let x;');
    const root = code.closest(`.${codeClasses.root}`);
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-lang')).toBe('ts');
  });

  it('shows the plain code in documents', () => {
    const html = renderToStaticMarkup(
      <DeckDocument>
        <Deck>
          <Slide title="Code">
            <Code lang="ts" code={'let x = 1 < 2;\nx;'}>
              <pre style={{ color: 'red' }}>
                <code>highlighted</code>
              </pre>
            </Code>
          </Slide>
        </Deck>
      </DeckDocument>,
    );
    expect(html).toMatch(
      /<\/h4><pre data-lang="ts">let x = 1 &lt; 2;\nx;<\/pre>$/,
    );
  });
});
