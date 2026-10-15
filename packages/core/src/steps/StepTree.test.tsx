import { cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Deck } from '../deck/Deck.tsx';
import { Slide } from '../slide/Slide.tsx';
import { Step } from './Step.tsx';
import { Steps } from './Steps.tsx';

function renderDeck(props: { defaultShowToc?: boolean } = {}) {
  return render(
    <Deck toc={[{ slide: 0 }, { slide: 1 }]} defaultShowSteps {...props}>
      <Slide title="First">
        <Step>
          Intro <Step>detail</Step> <Step with="previous">more</Step>
        </Step>
        <Steps count={2}>Figure</Steps>
        <Step>
          <span aria-hidden>x</span>
        </Step>
      </Slide>
      <Slide title="Second" />
    </Deck>,
  );
}

/** Returns the entries of the step tree, marking the current one with `*`. */
function entries(): string[] {
  const nav = screen.getByRole('navigation', { name: 'Steps' });
  return within(nav)
    .getAllByRole('button')
    .map(
      (button) =>
        (button.getAttribute('aria-current') === 'step' ? '*' : '') +
        button.textContent,
    );
}

describe('StepTree', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '#');
  });

  afterEach(() => {
    cleanup();
  });

  it('lists the steps of the current slide by their text', () => {
    renderDeck();
    expect(entries()).toEqual([
      '*Start of the slide',
      'Intro',
      'detail · more',
      'Figure (1/2)',
      'Figure (2/2)',
      'Step 4',
    ]);
  });

  it('goes to steps and highlights the current one', async () => {
    const user = userEvent.setup();
    renderDeck();
    await user.click(screen.getByRole('button', { name: 'detail · more' }));
    expect(window.location.hash).toBe('#slide=1&step=1.1');
    expect(entries()[2]).toBe('*detail · more');
    // The focus stays where it was, so that Space goes to the next step.
    await user.keyboard(' ');
    expect(window.location.hash).toBe('#slide=1&step=2');
    await user.click(
      screen.getByRole('button', { name: 'Start of the slide' }),
    );
    expect(window.location.hash).toBe('#slide=1');
  });

  it('follows the current slide', async () => {
    const user = userEvent.setup();
    renderDeck();
    await user.keyboard('{PageDown}');
    expect(screen.queryByRole('navigation', { name: 'Steps' })).toBeNull();
    expect(screen.getByText('This slide has no steps.')).toBeDefined();
  });

  it('is toggled with Shift+T, and shares the sidebar with the contents', async () => {
    const user = userEvent.setup();
    renderDeck({ defaultShowToc: true });
    const contents = screen.getByRole('button', { name: 'Contents' });
    const steps = screen.getByRole('button', { name: 'Steps' });
    expect(contents.getAttribute('aria-expanded')).toBe('true');
    expect(steps.getAttribute('aria-expanded')).toBe('true');
    await user.keyboard('{Shift>}T{/Shift}');
    expect(steps.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('navigation', { name: 'Steps' })).toBeNull();
    // The collapsed section stays in the sidebar while the other is expanded.
    await user.click(steps);
    expect(screen.getByRole('navigation', { name: 'Steps' })).toBeDefined();
    await user.click(contents);
    await user.click(steps);
    expect(screen.queryByRole('button', { name: 'Contents' })).toBeNull();
  });
});
