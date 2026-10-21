import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Deck } from '../deck/Deck.tsx';
import { Slide } from '../slide/Slide.tsx';
import { captureThumbnail } from './captureThumbnail.ts';
import { useSlideState } from '../state/useSlideState.ts';

const originalCapture = vi.mocked(captureThumbnail).getMockImplementation();
const pending: {
  frame: HTMLElement;
  signal: AbortSignal | undefined;
  resolve: (image: string) => void;
}[] = [];

function swipe(target: HTMLElement, direction: number, cancel = false) {
  const touch = {
    pointerId: 1,
    pointerType: 'touch',
    isPrimary: true,
    clientY: 10,
  };
  fireEvent.pointerDown(target, { ...touch, clientX: 500 });
  fireEvent.pointerMove(target, { ...touch, clientX: 500 + direction * 50 });
  fireEvent.pointerMove(target, { ...touch, clientX: 500 + direction * 450 });
  if (cancel) {
    fireEvent.pointerCancel(target, {
      ...touch,
      clientX: 500 + direction * 450,
    });
  } else {
    fireEvent.pointerUp(target, { ...touch, clientX: 500 + direction * 450 });
  }
}

function setup() {
  return render(
    <Deck>
      <Slide title="First" />
      <Slide title="Second" />
      <Slide title="Third" />
    </Deck>,
  );
}

describe('swiping while capturing a departed slide', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '#');
    pending.length = 0;
    vi.mocked(captureThumbnail).mockImplementation((frame, signal) => {
      const result = Promise.withResolvers<string>();
      pending.push({ frame, signal, resolve: result.resolve });
      return result.promise;
    });
  });

  afterEach(() => {
    cleanup();
    if (originalCapture)
      vi.mocked(captureThumbnail).mockImplementation(originalCapture);
  });

  it('keeps the actual departing frame inert behind the new slide until captured', async () => {
    const { container } = setup();
    const first = screen.getByRole('heading', { name: 'First' });
    const frame = first.closest('[data-seminar-view]');
    swipe(first, -1);
    expect(window.location.hash).toBe('#slide=2');
    expect(first.isConnected).toBe(true);
    expect(frame?.hasAttribute('inert')).toBe(true);
    expect(frame?.hasAttribute('data-seminar-retained')).toBe(true);
    expect(screen.getByRole('heading', { name: 'Second' })).toBeDefined();
    const capture = pending.find((job) => job.frame === frame);
    expect(capture).toBeDefined();
    await act(() => {
      capture?.resolve('data:image/png,first');
      return Promise.resolve();
    });
    expect(first.isConnected).toBe(false);
    expect(container.querySelector('[data-seminar-retained]')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Second' })).toBeDefined();
  });

  it('keeps the current slide on cancellation while an earlier capture is pending', () => {
    const { container } = setup();
    swipe(screen.getByRole('heading', { name: 'First' }), -1);
    const second = screen.getByRole('heading', { name: 'Second' });
    const frame = second.closest('[data-seminar-view]');
    swipe(second, -1, true);
    expect(window.location.hash).toBe('#slide=2');
    expect(screen.getByRole('heading', { name: 'Second' })).toBe(second);
    expect(frame?.hasAttribute('inert')).toBe(false);
    expect(container.querySelectorAll('[data-seminar-retained]')).toHaveLength(
      1,
    );
  });

  it('keeps departing transient values for capture and starts fresh on an immediate return', async () => {
    function Counter() {
      const [count, setCount] = useSlideState(0, { transient: true });
      return (
        <button
          onClick={() => {
            setCount(count + 1);
          }}
        >
          Count {count}
        </button>
      );
    }
    render(
      <Deck defaultMouseNavigation={false}>
        <Slide title="First">
          <Counter />
        </Slide>
        <Slide title="Second" />
      </Deck>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Count 0' }));
    const first = screen.getByRole('heading', { name: 'First' });
    swipe(first, -1);
    const job = pending.find((job) => job.frame.contains(first));
    expect(job?.frame.textContent).toContain('Count 1');
    swipe(screen.getByRole('heading', { name: 'Second' }), 1);
    expect(screen.getByRole('button', { name: 'Count 0' })).toBeDefined();
    expect(job?.signal?.aborted).toBe(true);
    await act(() => {
      job?.resolve('data:image/png,obsolete');
      return Promise.resolve();
    });
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Count 0' }), {
      pointerType: 'mouse',
      isPrimary: true,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Count 0' }));
    expect(screen.getByRole('button', { name: 'Count 1' })).toBeDefined();
    swipe(screen.getByRole('heading', { name: 'First' }), -1, true);
    expect(screen.getByRole('button', { name: 'Count 1' })).toBeDefined();
  });

  it('bounds retained DOM and cancels obsolete captures on rapid and reversed swipes', async () => {
    const { container, unmount } = setup();
    const first = screen.getByRole('heading', { name: 'First' });
    swipe(first, -1);
    const firstJob = pending.find((job) => job.frame.contains(first));
    expect(firstJob).toBeDefined();
    swipe(screen.getByRole('heading', { name: 'Second' }), -1);
    expect(window.location.hash).toBe('#slide=3');
    expect(first.isConnected).toBe(false);
    expect(firstJob?.signal?.aborted).toBe(true);
    expect(container.querySelectorAll('[data-seminar-retained]')).toHaveLength(
      1,
    );
    swipe(screen.getByRole('heading', { name: 'Third' }), 1);
    const second = screen.getByRole('heading', { name: 'Second' });
    expect(window.location.hash).toBe('#slide=2');
    expect(container.querySelectorAll('[data-seminar-retained]')).toHaveLength(
      1,
    );
    // An obsolete completion must not remove either of the newer frames.
    await act(() => {
      firstJob?.resolve('data:image/png,obsolete');
      return Promise.resolve();
    });
    expect(second.isConnected).toBe(true);
    expect(container.querySelectorAll('[data-seminar-retained]')).toHaveLength(
      1,
    );
    unmount();
    expect(pending.every((job) => job.signal?.aborted)).toBe(true);
  });
});
