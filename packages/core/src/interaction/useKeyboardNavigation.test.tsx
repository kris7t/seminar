import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Slide } from '../slide/Slide.tsx';
import { Step } from '../steps/Step.tsx';
import { Deck } from '../deck/Deck.tsx';

function renderDeck() {
  return render(
    <Deck>
      <Slide title="Title">
        <button type="button">Button</button>
        <input aria-label="Text" />
        <div role="slider" tabIndex={0} aria-valuenow={0}>
          Slider
        </div>
        <div data-slider-interactive tabIndex={0}>
          Custom
        </div>
        <Step>a</Step>
        <Step>b</Step>
      </Slide>
    </Deck>,
  );
}

describe('keyboard navigation', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '#');
  });

  afterEach(() => {
    cleanup();
  });

  it('leaves Space to a focused button, but not the arrow keys', async () => {
    const user = userEvent.setup();
    renderDeck();
    screen.getByText('Button').focus();
    await user.keyboard(' ');
    expect(window.location.hash).toBe('#slide=1');
    await user.keyboard('{ArrowRight}');
    expect(window.location.hash).toBe('#slide=1&step=1');
  });

  it('leaves the arrow keys and Space to a focused slider', async () => {
    const user = userEvent.setup();
    renderDeck();
    screen.getByText('Slider').focus();
    await user.keyboard('{ArrowRight}{PageDown} ');
    expect(window.location.hash).toBe('#slide=1');
  });

  it.each(['Text', 'Custom'])('leaves all keys to %s', async (name) => {
    const user = userEvent.setup();
    renderDeck();
    const element =
      name === 'Text' ? screen.getByLabelText(name) : screen.getByText(name);
    element.focus();
    await user.keyboard(' {ArrowRight}{PageDown}{End}');
    expect(window.location.hash).toBe('#slide=1');
  });

  it('moves the focus away on Escape', async () => {
    const user = userEvent.setup();
    renderDeck();
    screen.getByLabelText('Text').focus();
    await user.keyboard('{Escape}{ArrowRight}');
    expect(document.activeElement).toBe(document.body);
    expect(window.location.hash).toBe('#slide=1&step=1');
  });
});
