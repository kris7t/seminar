import { cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Deck } from '../deck/Deck.tsx';
import { Slide } from '../slide/Slide.tsx';
import { useSlideView } from '../slide/SlideViewContext.ts';
import { Step, stepClasses } from '../steps/Step.tsx';

function ViewKind() {
  const { kind, interactive } = useSlideView();
  return <span>{`${kind} ${String(interactive)}`}</span>;
}

function renderDeck() {
  return render(
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
}

const overview = () => screen.getByRole('region', { name: 'Slide overview' });

const current = () =>
  within(overview())
    .getAllByRole('button')
    .find((button) => button.getAttribute('aria-current') === 'page')
    ?.getAttribute('aria-label');

describe('SlideOverview', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '#');
  });

  afterEach(() => {
    cleanup();
  });

  it('shows all slides in thumbnail views', async () => {
    const user = userEvent.setup();
    renderDeck();
    await user.keyboard('o');
    expect(
      within(overview())
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual(['Slide 1', 'Slide 2', 'Slide 3']);
    expect(current()).toBe('Slide 1');
    // Slides are not in the buttons, which would change their styles.
    expect(within(overview()).getByText('Later').closest('button')).toBeNull();
    // Each thumbnail knows its slide.
    expect(within(overview()).getByText('2 / 3')).toBeDefined();
    expect(within(overview()).getByText('thumbnail false')).toBeDefined();
  });

  it('shows and keeps the steps last shown on each slide', async () => {
    const user = userEvent.setup();
    renderDeck();
    const isShown = () =>
      within(overview())
        .getByText('Later')
        .classList.contains(stepClasses.active);
    await user.keyboard('o');
    expect(isShown()).toBe(false);
    await user.keyboard('{Escape}{ArrowRight}{PageDown}o');
    expect(isShown()).toBe(true);
    // Moving through the overview doesn't change the steps.
    await user.keyboard('{ArrowLeft}{ArrowRight}{ArrowLeft}{Home}{End}');
    expect(isShown()).toBe(true);
    await user.click(
      within(overview()).getByRole('button', { name: 'Slide 1' }),
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

  it('goes to a clicked slide', async () => {
    const user = userEvent.setup();
    renderDeck();
    await user.keyboard('o');
    await user.click(
      within(overview()).getByRole('button', { name: 'Slide 2' }),
    );
    expect(screen.queryByRole('region')).toBeNull();
    expect(window.location.hash).toBe('#slide=2');
    expect(screen.getByText('audience true')).toBeDefined();
  });

  it('changes the current slide with the keyboard', async () => {
    const user = userEvent.setup();
    renderDeck();
    await user.keyboard('o{ArrowRight}{ArrowRight}');
    expect(current()).toBe('Slide 3');
    await user.keyboard('{ArrowLeft}{Enter}');
    expect(screen.queryByRole('region')).toBeNull();
    expect(window.location.hash).toBe('#slide=2');
  });

  it('closes with Escape and o', async () => {
    const user = userEvent.setup();
    renderDeck();
    await user.keyboard('o{Escape}');
    expect(screen.queryByRole('region')).toBeNull();
    await user.keyboard('oo');
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('opens from the context menu', async () => {
    const user = userEvent.setup();
    renderDeck();
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
