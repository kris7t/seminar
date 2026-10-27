import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import {
  Deck,
  DeckDocument,
  Slide,
  Step,
  useSlideElement,
} from '@seminar/core';
import flowchart from 'pele/diagrams/flowchart';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

/**
 * Makes elements as wide as their width in pixels, if any, up to `available`
 * with a `max-width` of `100%`, or else `available`, since jsdom has no
 * layout.
 */
function stubWidths(available: number) {
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(
    function (this: HTMLElement) {
      const width = /^(\d+)px$/.exec(this.style.width)?.[1];
      if (width === undefined) return available;
      return this.style.maxWidth === '100%'
        ? Math.min(Number(width), available)
        : Number(width);
    },
  );
}

/** Returns the width and height of the SVG of the diagram. */
function sizeOfSvg(): [width: number, height: number] {
  const [, , width = 0, height = 0] = (
    document.querySelector('svg')?.getAttribute('viewBox') ?? ''
  )
    .split(' ')
    .map(Number);
  return [width, height];
}

const WIDE =
  'flowchart LR\n  A[Parse] --> B[Render] --> C[Show] --> D[Present]';

describe('Diagram', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '#');
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
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

  it('names the steps of items of named diagrams after them', async () => {
    const user = userEvent.setup();
    render(
      <Deck>
        <Slide title="Diagram">
          <Diagram
            source={'flowchart LR\n  A[Parse] --> B[Render] --> C[Show]'}
            diagrams={[flowchart]}
            id="pipeline"
            steps={[{ items: ['B'] }, { items: ['C'] }]}
          />
          <Step group="pipeline.C" data-testid="note">
            Shown with C
          </Step>
        </Slide>
      </Deck>,
    );
    await screen.findByText('Show');
    const shown = () =>
      [
        !document
          .querySelector('[data-id="B"]')
          ?.classList.contains(diagramClasses.hidden),
        !document
          .querySelector('[data-id="C"]')
          ?.classList.contains(diagramClasses.hidden),
        getComputedStyle(screen.getByTestId('note')).visibility !== 'hidden',
      ].join(' ');
    const seen = [shown()];
    for (let i = 0; i < 3; i += 1) {
      await user.keyboard('{ArrowRight}');
      seen.push(shown());
    }
    // `B`, `C`, and the note, which is shown with `C`.
    expect(seen).toEqual([
      'false false false',
      'true false false',
      'true true true',
      'true true true',
    ]);
  });

  it('shows the formulas in labels, in the size of the text', async () => {
    render(
      <Deck>
        <Slide title="Diagram">
          <Diagram
            source={'flowchart LR\n  A["$$x$$"]'}
            diagrams={[flowchart]}
            formulas={{
              x: { svg: '<svg data-formula="x"></svg>', width: 2, height: 1 },
            }}
          />
        </Slide>
      </Deck>,
    );
    await waitFor(() => {
      expect(document.querySelector('[data-formula="x"]')).not.toBeNull();
    });
    const box = document.querySelector('[data-formula="x"]')?.parentElement;
    expect(box?.getAttribute('class')).toBe('pele-math');
    // Twice as wide as the text is high.
    expect(Number(box?.getAttribute('width'))).toBe(
      2 * Number(box?.getAttribute('height')),
    );
  });

  it('lays out wide diagrams to fit their width before scaling', async () => {
    stubWidths(300);
    render(
      <Deck>
        <Slide title="Diagram">
          <Diagram source={WIDE} diagrams={[flowchart]} scale="1.5" />
        </Slide>
      </Deck>,
    );
    await screen.findByText('Present');
    const [width, height] = sizeOfSvg();
    // Laid out from top to bottom to fit 200 pixels, scaled to 300 at most.
    expect(width).toBeGreaterThan(0);
    expect(width).toBeLessThanOrEqual(200);
    expect(height).toBeGreaterThan(width);
    expect(
      document
        .querySelector<HTMLElement>(`.${diagramClasses.svg}`)
        ?.style.getPropertyValue('--SeminarDiagram-width'),
    ).toBe(`${String(width * 1.5)}px`);
  });

  it('lays out diagrams in their width, even if more than available', async () => {
    stubWidths(300);
    render(
      <Deck>
        <Slide title="Diagram">
          <Diagram source={WIDE} diagrams={[flowchart]} width={2000} />
        </Slide>
      </Deck>,
    );
    await screen.findByText('Present');
    const [width, height] = sizeOfSvg();
    // Still from left to right, and shown smaller to fit, like images.
    expect(width).toBeGreaterThan(300);
    expect(height).toBeLessThan(width);
    const box = document.querySelector<HTMLElement>(
      `.${diagramClasses.svg}`,
    )?.parentElement;
    expect(box?.style.width).toBe('2000px');
    expect(box?.style.maxWidth).toBe('100%');
  });

  it('renders the text of diagrams in their font size', async () => {
    render(
      <Deck>
        <Slide title="Diagram">
          <Diagram source={SOURCE} diagrams={[flowchart]} fontSize={10} />
        </Slide>
      </Deck>,
    );
    await screen.findByText('Parse');
    const root = document.querySelector<HTMLElement>(`.${diagramClasses.root}`);
    expect(root?.style.fontSize).toBe('10px');
    expect(root?.querySelector('svg')?.getAttribute('style')).toMatch(
      /\bfont:10px /,
    );
  });

  it('keeps the size of diagrams narrower than their width', async () => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(1000);
    render(
      <Deck>
        <Slide title="Diagram">
          <Diagram source={SOURCE} diagrams={[flowchart]} />
        </Slide>
      </Deck>,
    );
    await screen.findByText('Parse');
    const content = document.querySelector<HTMLElement>(
      `.${diagramClasses.svg}`,
    );
    const width = content?.querySelector('svg')?.getAttribute('width');
    expect(Number(width)).toBeLessThan(1000);
    expect(content?.style.getPropertyValue('--SeminarDiagram-width')).toBe(
      `${width ?? ''}px`,
    );
    expect(content?.parentElement?.style.width).toBe('100%');
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
