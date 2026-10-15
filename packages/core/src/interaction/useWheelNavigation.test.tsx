import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Deck } from '../deck/Deck.tsx';
import { Slide } from '../slide/Slide.tsx';
import { Step } from '../steps/Step.tsx';
import { WHEEL_REST, WHEEL_STEP } from './useWheelNavigation.ts';

function renderDeck() {
  return render(
    <Deck>
      <Slide title="Title">
        <p>Text</p>
        <div data-testid="scroller" style={{ overflowY: 'auto' }}>
          Scrolling
        </div>
        <input aria-label="Field" />
        <Step>a</Step>
        <Step>b</Step>
        <Step>c</Step>
      </Slide>
    </Deck>,
  );
}

function rest() {
  act(() => {
    vi.advanceTimersByTime(WHEEL_REST);
  });
}

describe('wheel navigation', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    window.history.replaceState(null, '', '#');
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('goes to another step after scrolling a bit', () => {
    renderDeck();
    const text = screen.getByText('Text');
    fireEvent.wheel(text, { deltaY: 30 });
    expect(window.location.hash).toBe('#slide=1');
    fireEvent.wheel(text, { deltaY: 30 });
    expect(window.location.hash).toBe('#slide=1&step=1');
    rest();
    fireEvent.wheel(text, { deltaY: 3, deltaMode: 1 });
    expect(window.location.hash).toBe('#slide=1&step=2');
    rest();
    fireEvent.wheel(text, { deltaY: -100 });
    expect(window.location.hash).toBe('#slide=1&step=1');
  });

  it('keeps going while scrolling further', () => {
    renderDeck();
    const text = screen.getByText('Text');
    fireEvent.wheel(text, { deltaY: 120 });
    expect(window.location.hash).toBe('#slide=1&step=1');
    fireEvent.wheel(text, { deltaY: WHEEL_STEP / 2 });
    expect(window.location.hash).toBe('#slide=1&step=1');
    fireEvent.wheel(text, { deltaY: WHEEL_STEP / 2 });
    expect(window.location.hash).toBe('#slide=1&step=2');
    fireEvent.wheel(text, { deltaY: 120 });
    expect(window.location.hash).toBe('#slide=1&step=3');
  });

  it('ignores zooming, sideways scrolling, and interactive elements', () => {
    renderDeck();
    fireEvent.wheel(screen.getByText('Text'), { deltaY: 100, ctrlKey: true });
    fireEvent.wheel(screen.getByText('Text'), { deltaY: 50, deltaX: 100 });
    fireEvent.wheel(screen.getByLabelText('Field'), { deltaY: 100 });
    expect(window.location.hash).toBe('#slide=1');
  });

  it('scrolls elements that can scroll instead', () => {
    renderDeck();
    const scroller = screen.getByTestId('scroller');
    Object.defineProperties(scroller, {
      scrollHeight: { configurable: true, value: 200 },
      clientHeight: { configurable: true, value: 100 },
    });
    fireEvent.wheel(scroller, { deltaY: 100 });
    // Reaching the end doesn't go on to the next step during the same scroll.
    scroller.scrollTop = 100;
    fireEvent.wheel(scroller, { deltaY: 100 });
    expect(window.location.hash).toBe('#slide=1');
    rest();
    fireEvent.wheel(scroller, { deltaY: 100 });
    expect(window.location.hash).toBe('#slide=1&step=1');
  });

  it('is off without mouse navigation', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderDeck();
    await user.keyboard('s');
    fireEvent.wheel(screen.getByText('Text'), { deltaY: 100 });
    expect(window.location.hash).toBe('#slide=1');
  });
});
