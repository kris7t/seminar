import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from '@testing-library/react';
import type { PointerEvent } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Deck } from '../deck/Deck.tsx';
import { Slide } from '../slide/Slide.tsx';
import { Step } from '../steps/Step.tsx';
import {
  useSwipeNavigation,
  type SwipeNavigationOptions,
} from './useSwipeNavigation.ts';

const WIDTH = 1000;

function setup(options: Partial<SwipeNavigationOptions> = {}) {
  const nextSlide = vi.fn<() => void>();
  const previousSlide = vi.fn<() => void>();
  const { result } = renderHook(() =>
    useSwipeNavigation({
      hasMoreSteps: () => false,
      canGoNext: true,
      canGoPrevious: true,
      nextSlide,
      previousSlide,
      width: WIDTH,
      slideWidth: WIDTH,
      ...options,
    }),
  );
  const target = document.createElement('div');
  const event = (x: number, y: number, time: number, pointerType = 'touch') =>
    ({
      pointerId: 1,
      pointerType,
      isPrimary: true,
      clientX: x,
      clientY: y,
      timeStamp: time,
      target,
      currentTarget: target,
    }) as unknown as PointerEvent<HTMLElement>;
  /** Swipes from x = 500 to `x` over `duration` ms. */
  const swipe = (x: number, duration = 1000, pointerType = 'touch') => {
    act(() => {
      result.current.handlers.onPointerDown(event(500, 0, 0, pointerType));
    });
    for (let i = 1; i <= 10; i += 1) {
      act(() => {
        result.current.handlers.onPointerMove(
          event(500 + ((x - 500) * i) / 10, 0, (duration * i) / 10),
        );
      });
    }
  };
  const release = (x: number, time = 1000) => {
    act(() => {
      result.current.handlers.onPointerUp(event(x, 0, time));
    });
  };
  return { result, nextSlide, previousSlide, swipe, release };
}

describe('useSwipeNavigation', () => {
  it('goes to the next slide on a long swipe left', () => {
    const { result, nextSlide, swipe, release } = setup();
    swipe(100);
    // Counted from where the touch started to move.
    expect(result.current.offset).toBe(-360);
    expect(result.current.moving).toBe(true);
    release(100);
    expect(nextSlide).toHaveBeenCalledOnce();
    expect(result.current.offset).toBe(0);
    expect(result.current.enterFrom).toBe(640);
    act(() => {
      result.current.onAnimationEnd();
    });
    expect(result.current.moving).toBe(false);
  });

  it('goes to the previous slide on a long swipe right', () => {
    const { result, previousSlide, swipe, release } = setup();
    swipe(900);
    release(900);
    expect(previousSlide).toHaveBeenCalledOnce();
    expect(result.current.enterFrom).toBe(-640);
  });

  it('springs back on a short, slow swipe', () => {
    const { result, nextSlide, swipe, release } = setup();
    swipe(400);
    release(400);
    expect(nextSlide).not.toHaveBeenCalled();
    expect(result.current.offset).toBe(0);
    expect(result.current.transition).toBe('settle');
    act(() => {
      result.current.onTransitionEnd();
    });
    expect(result.current.moving).toBe(false);
  });

  it('measures swipes by the slide if it is narrower than the area', () => {
    const { result, nextSlide, swipe, release } = setup({ slideWidth: 200 });
    swipe(400);
    release(400);
    expect(nextSlide).toHaveBeenCalledOnce();
    // The next slide is still a whole area away.
    expect(result.current.enterFrom).toBe(930);
  });

  it('stops moving even if the browser does not report the end', () => {
    vi.useFakeTimers();
    try {
      const { result, swipe, release } = setup();
      swipe(400);
      release(400);
      expect(result.current.moving).toBe(true);
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(result.current.moving).toBe(false);
      swipe(100);
      release(100);
      expect(result.current.enterFrom).toBeDefined();
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(result.current.moving).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('treats small moves as taps or long presses', () => {
    const { result, nextSlide, swipe, release } = setup();
    swipe(480, 100);
    release(480, 100);
    expect(result.current.moving).toBe(false);
    expect(nextSlide).not.toHaveBeenCalled();
  });

  it('goes to the next slide on a short fling', () => {
    const { nextSlide, swipe, release } = setup();
    swipe(400, 100);
    release(400, 100);
    expect(nextSlide).toHaveBeenCalledOnce();
  });

  it('ignores the mouse', () => {
    const { result, nextSlide, swipe, release } = setup();
    swipe(100, 1000, 'mouse');
    release(100);
    expect(result.current.offset).toBe(0);
    expect(nextSlide).not.toHaveBeenCalled();
  });

  it('resists swiping past more steps and shows a hint', () => {
    const { result, nextSlide, swipe, release } = setup({
      hasMoreSteps: () => true,
    });
    // Moves slowly, however fast the finger is.
    swipe(420, 100);
    expect(result.current.offset).toBe(-12);
    expect(result.current.showHint).toBe(true);
    release(420, 100);
    expect(nextSlide).not.toHaveBeenCalled();
    // The hint stays for a while after letting go.
    expect(result.current.showHint).toBe(true);
  });

  it('breaks through the resistance of more steps', () => {
    const { result, nextSlide, swipe, release } = setup({
      hasMoreSteps: () => true,
    });
    swipe(100);
    expect(result.current.offset).toBe(-360);
    release(100);
    expect(nextSlide).toHaveBeenCalledOnce();
    expect(result.current.showHint).toBe(false);
  });

  it('does not resist swiping back', () => {
    const { result, previousSlide, swipe, release } = setup({
      hasMoreSteps: () => true,
    });
    swipe(900);
    expect(result.current.showHint).toBe(false);
    release(900);
    expect(previousSlide).toHaveBeenCalledOnce();
  });

  it('does not go past the last slide', () => {
    const { result, nextSlide, swipe, release } = setup({ canGoNext: false });
    swipe(100);
    expect(result.current.offset).toBeGreaterThan(-80);
    release(100);
    expect(nextSlide).not.toHaveBeenCalled();
  });
});

describe('swiping a deck', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '#');
  });

  afterEach(() => {
    cleanup();
  });

  it('changes the slide but taps go through the steps', () => {
    render(
      <Deck>
        <Slide title="First">
          <Step>a</Step>
        </Slide>
        <Slide title="Second" />
      </Deck>,
    );
    const target = screen.getByText('First');
    const touch = { pointerId: 1, pointerType: 'touch', isPrimary: true };
    fireEvent.pointerDown(target, { ...touch, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(target, { ...touch, clientX: 10, clientY: 10 });
    fireEvent.click(target);
    expect(window.location.hash).toBe('#slide=1&step=1');
    fireEvent.pointerDown(target, { ...touch, clientX: 300, clientY: 10 });
    fireEvent.pointerMove(target, { ...touch, clientX: 250, clientY: 10 });
    fireEvent.pointerMove(target, { ...touch, clientX: 100, clientY: 10 });
    fireEvent.pointerUp(target, { ...touch, clientX: 100, clientY: 10 });
    fireEvent.click(target);
    expect(window.location.hash).toBe('#slide=2');
  });

  it('shows the hint about more steps over the slide', () => {
    render(
      <Deck>
        <Slide title="First">
          <Step>a</Step>
        </Slide>
        <Slide title="Second" />
      </Deck>,
    );
    const target = screen.getByText('First');
    const touch = { pointerId: 1, pointerType: 'touch', isPrimary: true };
    fireEvent.pointerDown(target, { ...touch, clientX: 300, clientY: 10 });
    fireEvent.pointerMove(target, { ...touch, clientX: 250, clientY: 10 });
    fireEvent.pointerMove(target, { ...touch, clientX: 200, clientY: 10 });
    const hint = screen.getByRole('status');
    expect(hint.textContent).toContain('This slide has more steps.');
    // In the area of the slides, but it doesn't move with them.
    expect(hint.parentElement?.contains(target)).toBe(true);
    expect(hint.closest('[style*="translate"]')).toBeNull();
  });
});

describe('pinching a deck', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '#');
  });

  afterEach(() => {
    cleanup();
  });

  const touches = (gap: number) => [
    { identifier: 1, clientX: 200 - gap / 2, clientY: 100 },
    { identifier: 2, clientX: 200 + gap / 2, clientY: 100 },
  ];

  it('opens the overview when pinching in', () => {
    render(
      <Deck>
        <Slide title="First" />
        <Slide title="Second" />
      </Deck>,
    );
    const target = screen.getByText('First');
    fireEvent.touchStart(target, { touches: touches(200) });
    fireEvent.touchMove(target, { touches: touches(150) });
    expect(screen.queryByRole('region', { name: 'Slide overview' })).toBeNull();
    fireEvent.touchMove(target, { touches: touches(100) });
    expect(
      screen.getByRole('region', { name: 'Slide overview' }),
    ).toBeDefined();
  });

  it('does not open the overview when pinching out', () => {
    render(
      <Deck>
        <Slide title="First" />
      </Deck>,
    );
    const target = screen.getByText('First');
    fireEvent.touchStart(target, { touches: touches(100) });
    fireEvent.touchMove(target, { touches: touches(300) });
    expect(screen.queryByRole('region', { name: 'Slide overview' })).toBeNull();
  });
});
