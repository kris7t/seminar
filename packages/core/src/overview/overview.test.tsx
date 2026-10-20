import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Deck } from '../deck/Deck.tsx';
import { Slide } from '../slide/Slide.tsx';
import { useSlideView } from '../view/SlideViewContext.ts';
import { Step, stepClasses } from '../steps/Step.tsx';

function ViewKind() {
  const { kind, interactive } = useSlideView();
  return <span>{`${kind} ${String(interactive)}`}</span>;
}

/** Renders a deck, and waits for it to find the steps of its slides. */
async function renderDeck() {
  const result = render(
    <Deck>
      <Slide title="First">
        <Step data-name="step">Later</Step>
      </Slide>
      <Slide title="Second">
        <ViewKind />
      </Slide>
      <Slide title="Third" />
    </Deck>,
  );
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  return result;
}

const overview = () => screen.getByRole('region', { name: 'Slide overview' });

const current = () =>
  within(overview())
    .getAllByRole('button')
    .find((button) => button.getAttribute('aria-current') === 'page')
    ?.textContent;

/** The rasterizer stub records the captured markup in the image URL. */
function thumbnail(index: number): HTMLElement | undefined {
  const image = overview().querySelectorAll('img')[index];
  return image === undefined
    ? undefined
    : new DOMParser().parseFromString(
        decodeURIComponent(image.src.split(',')[1] ?? ''),
        'text/html',
      ).body;
}

describe('SlideOverview', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '#');
  });

  afterEach(() => {
    cleanup();
  });

  it('shows all slides as cached thumbnails', async () => {
    const user = userEvent.setup();
    await renderDeck();
    await user.keyboard('o');
    expect(
      within(overview())
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual([
      'Slide 1: First (with steps)',
      'Slide 2: Second',
      'Slide 3: Third',
    ]);
    expect(current()).toBe('Slide 1: First (with steps)');
    // Slides are not in the buttons, which would change their styles.
    expect(overview().querySelector('img')?.closest('button')).toBeNull();
    // Each thumbnail knows its slide.
    await waitFor(() => {
      expect(thumbnail(1)?.textContent).toContain('2 / 3');
      expect(thumbnail(1)?.textContent).toContain('thumbnail false');
    });
  });

  it('opens without mounting live copies of the slides', async () => {
    const user = userEvent.setup();
    await renderDeck();
    await user.keyboard('o');
    expect(within(overview()).getAllByRole('button')).toHaveLength(3);
    expect(within(overview()).queryByText('Later')).toBeNull();
    expect(within(overview()).queryByText('thumbnail false')).toBeNull();
  });

  it('shows and keeps the steps last shown on each slide', async () => {
    const user = userEvent.setup();
    await renderDeck();
    const isShown = () =>
      !thumbnail(0)
        ?.querySelector('[data-name="step"]')
        ?.classList.contains(stepClasses.future);
    await user.keyboard('o');
    expect(isShown()).toBe(false);
    await user.keyboard('{Escape}{ArrowRight}{PageDown}o');
    await waitFor(() => {
      expect(isShown()).toBe(true);
    });
    // Moving through the overview doesn't change the steps.
    await user.keyboard('{ArrowLeft}{ArrowRight}{ArrowLeft}{Home}{End}');
    expect(isShown()).toBe(true);
    await user.click(
      within(overview()).getByRole('button', {
        name: 'Slide 1: First (with steps)',
      }),
    );
    expect(window.location.hash).toBe('#slide=1&step=1');
  });

  it('goes to the last step of the last slide with End', async () => {
    const user = userEvent.setup();
    render(
      <Deck>
        <Slide title="First" />
        <Slide title="Last">
          <Step data-name="step">Later</Step>
        </Slide>
      </Deck>,
    );
    await user.keyboard('{End}');
    expect(window.location.hash).toBe('#slide=2&step=1');
  });

  it('groups slides by divisions and jumps between them', async () => {
    const user = userEvent.setup();
    render(
      <Deck
        toc={[
          {
            slide: 0,
            children: [
              { slide: 1, children: [{ slide: 2 }, { slide: 3 }] },
              { slide: 4, children: [{ slide: 5 }] },
            ],
          },
        ]}
      >
        <Slide master="title" title="Talk" />
        <Slide master="section" title="Part one" />
        <Slide title="A" />
        <Slide title="B" />
        <Slide master="section" title="Part two" />
        <Slide title="C" />
      </Deck>,
    );
    await user.keyboard('o');
    expect(
      within(overview())
        .getAllByRole('heading', { level: 2 })
        .map(({ textContent }) => textContent),
    ).toEqual(['Talk']);
    expect(
      within(overview())
        .getAllByRole('heading', { level: 3 })
        .map(({ textContent }) => textContent),
    ).toEqual(['Part one', 'Part two']);
    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(current()).toBe('Slide 3: A');
    await user.keyboard('{ArrowDown}');
    expect(current()).toBe('Slide 5: Part two');
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(current()).toBe('Slide 1: Talk');
    await user.keyboard('{ArrowUp}');
    expect(current()).toBe('Slide 1: Talk');
  });

  it('names the slides by their titles in the table of contents', async () => {
    const user = userEvent.setup();
    render(
      <Deck
        toc={[
          { slide: 0, title: <em>Intro</em> },
          { slide: 2, title: 'Again' },
        ]}
      >
        <Slide id="first" title="First" />
        <Slide />
        <Slide recap="first" />
      </Deck>,
    );
    await user.keyboard('o');
    const buttons = within(overview()).getAllByRole('button');
    expect(buttons.map(({ textContent }) => textContent)).toEqual([
      'Slide 1: Intro (recapped later)',
      'Slide 2',
      'Slide 3: Again (recap)',
    ]);
    expect(buttons[0]?.querySelector('em')?.textContent).toBe('Intro');
    await user.hover(
      within(overview()).getByRole('button', {
        name: 'Slide 3: Again (recap)',
      }),
    );
    expect((await screen.findByRole('tooltip')).textContent).toBe('Again');
    // Scrolling the overview closes it.
    fireEvent.scroll(overview());
    await waitFor(() => {
      expect(screen.queryByRole('tooltip')).toBeNull();
    });
  });

  it('goes to a clicked slide', async () => {
    const user = userEvent.setup();
    await renderDeck();
    await user.keyboard('o');
    await user.click(
      within(overview()).getByRole('button', { name: 'Slide 2: Second' }),
    );
    expect(screen.queryByRole('region')).toBeNull();
    expect(window.location.hash).toBe('#slide=2');
    expect(screen.getByText('audience true')).toBeDefined();
  });

  it('changes the current slide with the keyboard', async () => {
    const user = userEvent.setup();
    await renderDeck();
    await user.keyboard('o{ArrowRight}{ArrowRight}');
    expect(current()).toBe('Slide 3: Third');
    await user.keyboard('{ArrowLeft}{Enter}');
    expect(screen.queryByRole('region')).toBeNull();
    expect(window.location.hash).toBe('#slide=2');
  });

  it('closes with Escape and o without going anywhere', async () => {
    const user = userEvent.setup();
    await renderDeck();
    await user.keyboard('o{ArrowRight}');
    // Selecting a slide doesn't go to it.
    expect(window.location.hash).toBe('#slide=1');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('region')).toBeNull();
    expect(window.location.hash).toBe('#slide=1');
    expect(screen.getByRole('heading').textContent).toBe('First');
    await user.keyboard('oo');
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('opens from the context menu', async () => {
    const user = userEvent.setup();
    await renderDeck();
    await user.pointer({
      keys: '[MouseRight]',
      target: screen.getByRole('heading'),
    });
    await user.click(
      within(await screen.findByRole('menu')).getByText('Slide overview'),
    );
    expect(overview()).toBeDefined();
  });
});
