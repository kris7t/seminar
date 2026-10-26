import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { Deck, DeckDocument, Slide, useSlideElement } from '@seminar/core';
import flowchart from 'pele/diagrams/flowchart';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';

import { Diagram, diagramClasses } from './Diagram.tsx';

/** Shows the classes of the element called `name` on the slide. */
function ClassOf({ name }: { name: string }) {
  const element = useSlideElement(name);
  return (
    <output data-testid="found">
      {element?.getAttribute('class') ?? 'none'}
    </output>
  );
}

const SOURCE = 'flowchart LR\n  accTitle: Steps\n  A[Parse] --> B[Render]';

describe('Diagram', () => {
  afterEach(() => {
    cleanup();
  });

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

  it('names the items of the diagram after it', async () => {
    render(
      <Deck>
        <Slide title="Diagram">
          <Diagram source={SOURCE} diagrams={[flowchart]} id="steps" />
          <ClassOf name="steps.B" />
        </Slide>
      </Deck>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('found').textContent).toMatch(/\bpele-node\b/);
    });
    expect(document.querySelector('[data-id="B"]')?.textContent).toBe('Render');
  });

  it('shows the items of the diagram in their steps', async () => {
    const user = userEvent.setup();
    render(
      <Deck>
        <Slide title="Diagram">
          <Diagram
            source={'flowchart LR\n  A[Parse] --> B[Render]'}
            diagrams={[flowchart]}
            steps={[{ items: ['B', 'L_A_B_0'], props: { title: 'Render' } }]}
          />
        </Slide>
      </Deck>,
    );
    await screen.findByText('Render');
    const hidden = (id: string) =>
      [...document.querySelectorAll(`[data-id="${id}"]`)].map((element) =>
        element.classList.contains(diagramClasses.hidden),
      );
    expect([hidden('A'), hidden('B'), hidden('L_A_B_0')]).toEqual([
      [false],
      [true],
      [true],
    ]);
    await user.keyboard('{ArrowRight}');
    expect([hidden('B'), hidden('L_A_B_0')]).toEqual([[false], [false]]);
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
