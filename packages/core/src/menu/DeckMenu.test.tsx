import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Deck } from '../deck/Deck.tsx';
import { LONG_PRESS_DELAY } from '../interaction/useContextMenu.ts';
import { Slide } from '../slide/Slide.tsx';
import { Step } from '../steps/Step.tsx';

function renderDeck() {
  return render(
    <Deck>
      <Slide title="First">
        <input aria-label="Text" />
        <Step>a</Step>
        <Step>b</Step>
      </Slide>
      <Slide title="Second" />
      <Slide title="Third" />
    </Deck>,
  );
}

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.pointer({
    keys: '[MouseRight]',
    target: screen.getByText('First'),
  });
  return screen.findByRole('menu');
}

describe('DeckMenu', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '#');
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('opens on right-click', async () => {
    const user = userEvent.setup();
    renderDeck();
    expect(await openMenu(user)).toBeDefined();
  });

  it('opens from the menu button', async () => {
    const user = userEvent.setup();
    renderDeck();
    const button = screen.getByRole('button', { name: 'Menu' });
    await user.click(button);
    expect(await screen.findByRole('menu')).toBeDefined();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    await user.click(screen.getByRole('menuitem', { name: /Next slide/ }));
    expect(window.location.hash).toBe('#slide=2');
    await waitFor(() => {
      expect(screen.queryByRole('menu')).toBeNull();
    });
    // The button doesn't take the focus, so Space goes to the next slide.
    expect(document.activeElement).not.toBe(button);
    await user.keyboard(' ');
    expect(window.location.hash).toBe('#slide=3');
  });

  it('opens on a long press without navigating', () => {
    vi.useFakeTimers();
    renderDeck();
    const target = screen.getByText('First');
    const touch = { pointerId: 1, pointerType: 'touch', isPrimary: true };
    fireEvent.pointerDown(target, { ...touch, clientX: 10, clientY: 10 });
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_DELAY);
    });
    // Some browsers fire this at the element under the finger, which is now
    // the backdrop of the menu.
    const backdrop = document.querySelector('.MuiBackdrop-root');
    expect(backdrop).not.toBeNull();
    expect(
      backdrop === null ? true : fireEvent.contextMenu(backdrop, touch),
    ).toBe(false);
    fireEvent.pointerUp(target, touch);
    fireEvent.click(target);
    expect(screen.getByRole('menu')).toBeDefined();
    expect(window.location.hash).toBe('#slide=1');
  });

  it('advances on a tap, or a long press that moves', () => {
    vi.useFakeTimers();
    renderDeck();
    const target = screen.getByText('First');
    const touch = { pointerId: 1, pointerType: 'touch', isPrimary: true };
    fireEvent.pointerDown(target, { ...touch, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(target, touch);
    fireEvent.click(target);
    expect(window.location.hash).toBe('#slide=1&step=1');
    fireEvent.pointerDown(target, { ...touch, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(target, { ...touch, clientX: 10, clientY: 50 });
    act(() => {
      vi.advanceTimersByTime(LONG_PRESS_DELAY);
    });
    fireEvent.pointerUp(target, touch);
    fireEvent.click(target);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(window.location.hash).toBe('#slide=1&step=2');
  });

  it('shows the menu as a dialog on touch screens', async () => {
    const matchMedia = window.matchMedia.bind(window);
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => {
      const list = matchMedia(query);
      Object.defineProperty(list, 'matches', {
        value: query === '(pointer: coarse)',
      });
      return list;
    });
    const user = userEvent.setup();
    renderDeck();
    await user.click(screen.getByRole('button', { name: 'Menu' }));
    const dialog = await screen.findByRole('dialog', { name: 'Menu' });
    expect(dialog.querySelector('[role="menu"]')).not.toBeNull();
    // No keyboard shortcuts.
    expect(screen.queryByText('PgDn')).toBeNull();
    await user.click(screen.getByRole('menuitem', { name: 'Next slide' }));
    expect(window.location.hash).toBe('#slide=2');
  });

  it('keeps the browser menu on Shift+right-click and in text fields', async () => {
    const user = userEvent.setup();
    renderDeck();
    await user.keyboard('{Shift>}');
    await user.pointer({
      keys: '[MouseRight]',
      target: screen.getByText('First'),
    });
    await user.keyboard('{/Shift}');
    await user.pointer({
      keys: '[MouseRight]',
      target: screen.getByLabelText('Text'),
    });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('runs navigation actions', async () => {
    const user = userEvent.setup();
    renderDeck();
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: /Next step/ }));
    expect(window.location.hash).toBe('#slide=1&step=1');
    await waitFor(() => {
      expect(screen.queryByRole('menu')).toBeNull();
    });
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: /Last slide/ }));
    expect(window.location.hash).toBe('#slide=3');
  });

  it('disables unavailable slide actions', async () => {
    const user = userEvent.setup();
    renderDeck();
    await openMenu(user);
    expect(
      screen
        .getByRole('menuitem', { name: /Previous slide/ })
        .getAttribute('aria-disabled'),
    ).toBe('true');
  });

  it('closes on Escape without navigating', async () => {
    const user = userEvent.setup();
    renderDeck();
    await openMenu(user);
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('menu')).toBeNull();
    });
    expect(window.location.hash).toBe('#slide=1');
  });

  it('closes on clicking outside without navigating', async () => {
    const user = userEvent.setup();
    renderDeck();
    await openMenu(user);
    const backdrop = document.querySelector('.MuiBackdrop-root');
    expect(backdrop).not.toBeNull();
    if (backdrop !== null) {
      await user.click(backdrop);
    }
    await waitFor(() => {
      expect(screen.queryByRole('menu')).toBeNull();
    });
    expect(window.location.hash).toBe('#slide=1');
  });

  it('goes to a slide by number', async () => {
    const user = userEvent.setup();
    renderDeck();
    await openMenu(user);
    await user.click(screen.getByRole('menuitem', { name: /Go to slide/ }));
    const input = await screen.findByLabelText('Slide number');
    await waitFor(() => {
      expect(document.activeElement).toBe(input);
    });
    expect(screen.getByText('/ 3')).toBeDefined();
    await user.clear(input);
    await user.type(input, '9');
    expect(
      screen.getByRole('button', { name: 'OK' }).hasAttribute('disabled'),
    ).toBe(true);
    await user.clear(input);
    await user.type(input, '2{Enter}');
    expect(window.location.hash).toBe('#slide=2');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('toggles text selection', async () => {
    const user = userEvent.setup();
    renderDeck();
    await openMenu(user);
    const toggle = screen.getByRole('menuitemcheckbox', {
      name: /Text selection/,
    });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    await user.click(toggle);
    await waitFor(() => {
      expect(screen.queryByRole('menu')).toBeNull();
    });
    await user.click(screen.getByText('First'));
    expect(window.location.hash).toBe('#slide=1');
    await openMenu(user);
    expect(
      screen
        .getByRole('menuitemcheckbox', { name: /Text selection/ })
        .getAttribute('aria-checked'),
    ).toBe('true');
  });

  it('toggles text selection with S', async () => {
    const user = userEvent.setup();
    renderDeck();
    await user.keyboard('s');
    await user.click(screen.getByText('First'));
    expect(window.location.hash).toBe('#slide=1');
    await user.keyboard('s');
    await user.click(screen.getByText('First'));
    expect(window.location.hash).not.toBe('#slide=1');
  });

  it.each(['g', ':'])('opens the slide number dialog with %s', async (key) => {
    const user = userEvent.setup();
    renderDeck();
    await user.keyboard(`${key}3{Enter}`);
    expect(window.location.hash).toBe('#slide=3');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('does not open the slide number dialog when typing', async () => {
    const user = userEvent.setup();
    renderDeck();
    await user.type(screen.getByLabelText('Text'), 'g:t');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByLabelText<HTMLInputElement>('Text').value).toBe('g:t');
  });
});
