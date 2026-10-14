import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Slide } from '../slide/Slide.tsx';
import { Step } from '../steps/Step.tsx';
import { Deck } from '../deck/Deck.tsx';

function renderDeck() {
  return render(
    <Deck>
      <Slide title="Title">
        <p>Text</p>
        <button type="button">Button</button>
        <a href="#nowhere">Link</a>
        <div role="button">Role button</div>
        <div tabIndex={0}>Focusable</div>
        <div data-slider-interactive>Custom</div>
        <div role="tablist">
          <span>Tab</span>
        </div>
        <div
          onClick={(event) => {
            event.stopPropagation();
          }}
        >
          Own handler
        </div>
        <Step>a</Step>
        <Step>b</Step>
      </Slide>
      <Slide title="Next" />
    </Deck>,
  );
}

describe('click navigation', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '#');
  });

  afterEach(() => {
    cleanup();
  });

  it('goes to the next step on click', async () => {
    const user = userEvent.setup();
    renderDeck();
    await user.click(screen.getByText('Text'));
    expect(window.location.hash).toBe('#slide=1&step=1');
    await user.click(screen.getByText('Title'));
    expect(window.location.hash).toBe('#slide=1&step=2');
    await user.click(screen.getByText('Text'));
    expect(window.location.hash).toBe('#slide=2');
  });

  it('goes to the previous step on Shift+click', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '#slide=1&step=2');
    renderDeck();
    await user.keyboard('{Shift>}');
    await user.click(screen.getByText('Text'));
    expect(window.location.hash).toBe('#slide=1&step=1');
  });

  it.each([
    'Button',
    'Role button',
    'Focusable',
    'Custom',
    'Tab',
    'Own handler',
  ])('ignores clicks on %s', async (name) => {
    const user = userEvent.setup();
    renderDeck();
    await user.click(screen.getByText(name));
    expect(window.location.hash).toBe('#slide=1');
  });

  it('ignores clicks on links', async () => {
    const user = userEvent.setup();
    renderDeck();
    await user.click(screen.getByText('Link'));
    // The link to an unknown slide doesn't move, and its hash gets replaced.
    await waitFor(() => {
      expect(window.location.hash).toBe('#slide=1');
    });
  });

  it('ignores other buttons and modifiers', async () => {
    const user = userEvent.setup();
    renderDeck();
    await user.pointer({
      keys: '[MouseRight]',
      target: screen.getByText('Text'),
    });
    await user.keyboard('{Control>}');
    await user.click(screen.getByText('Text'));
    expect(window.location.hash).toBe('#slide=1');
  });

  it('ignores clicks that select text', () => {
    renderDeck();
    const text = screen.getByText('Text');
    window.getSelection()?.selectAllChildren(text);
    fireEvent.click(text);
    expect(window.location.hash).toBe('#slide=1');
    window.getSelection()?.removeAllRanges();
  });

  it('can be disabled', async () => {
    const user = userEvent.setup();
    render(
      <Deck mouseNavigation={false}>
        <Slide title="Title">
          <Step>a</Step>
        </Slide>
      </Deck>,
    );
    await user.click(screen.getByText('Title'));
    expect(window.location.hash).toBe('#slide=1');
  });

  it('prevents text selection outside interactive elements', () => {
    const { container } = render(
      <Deck>
        <Slide title="Title">
          <div data-slider-interactive>Custom</div>
        </Slide>
      </Deck>,
    );
    const root = container.firstElementChild;
    expect(root).not.toBeNull();
    if (root !== null) {
      expect(getComputedStyle(root).userSelect).toBe('none');
    }
    expect(getComputedStyle(screen.getByText('Custom')).userSelect).toBe(
      'text',
    );
  });

  it('allows text selection without mouse navigation', () => {
    const { container } = render(
      <Deck mouseNavigation={false}>
        <Slide title="Title" />
      </Deck>,
    );
    const root = container.firstElementChild;
    expect(root).not.toBeNull();
    if (root !== null) {
      expect(getComputedStyle(root).userSelect).not.toBe('none');
    }
  });
});
