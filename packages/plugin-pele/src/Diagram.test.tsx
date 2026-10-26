import { render, screen, waitFor } from '@testing-library/react';
import { Deck, DeckDocument, Slide } from '@seminar/core';
import flowchart from 'pele/diagrams/flowchart';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Diagram, diagramClasses } from './Diagram.tsx';

const SOURCE = 'flowchart LR\n  accTitle: Steps\n  A[Parse] --> B[Render]';

describe('Diagram', () => {
  it('renders the diagram on the slide', async () => {
    render(
      <Deck>
        <Slide title="Diagram">
          <Diagram source={SOURCE} diagrams={[flowchart]} id="steps" />
        </Slide>
      </Deck>,
    );
    await screen.findByText('Parse');
    const root = document.querySelector(`.${diagramClasses.root}`);
    const svg = root?.querySelector('svg');
    expect(svg).not.toBeNull();
    // Named by the slide, which may be rendered several times in a document.
    const name = root?.id ?? '';
    expect(name).toMatch(/^seminar-.+-steps$/);
    expect(svg?.getAttribute('aria-labelledby')).toBe(`${name}-title`);
    expect(svg?.querySelector('title')?.id).toBe(`${name}-title`);
  });

  it('shows the source of diagrams it cannot render', async () => {
    render(
      <Deck>
        <Slide title="Diagram">
          {/* A type of diagrams that isn't registered with Pele. */}
          <Diagram source={'sequenceDiagram\n  A->>B: Hi'} />
        </Slide>
      </Deck>,
    );
    await waitFor(() => {
      expect(document.querySelector(`.${diagramClasses.error}`)).not.toBeNull();
    });
    const error = document.querySelector(`.${diagramClasses.error}`);
    expect(error?.textContent).toBe('sequenceDiagram\n  A->>B: Hi');
    expect(error?.getAttribute('title')).toMatch(/^Cannot render diagram: /);
  });

  it('shows the source in documents', () => {
    const html = renderToStaticMarkup(
      <DeckDocument>
        <Deck>
          <Slide title="Diagram">
            <Diagram
              source={'flowchart LR\n  A --> B'}
              diagrams={[flowchart]}
            />
          </Slide>
        </Deck>
      </DeckDocument>,
    );
    expect(html).toMatch(
      /<\/h4><pre data-lang="mermaid">flowchart LR\n {2}A --&gt; B<\/pre><\/section>$/,
    );
  });
});
