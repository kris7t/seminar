import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Deck } from '../deck/Deck.tsx';
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
  });

  it('opens on right-click', async () => {
    const user = userEvent.setup();
    renderDeck();
    expect(await openMenu(user)).toBeDefined();
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

  it('opens the slide number dialog with :', async () => {
    const user = userEvent.setup();
    renderDeck();
    await user.keyboard(':3{Enter}');
    expect(window.location.hash).toBe('#slide=3');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('does not open the slide number dialog when typing :', async () => {
    const user = userEvent.setup();
    renderDeck();
    await user.type(screen.getByLabelText('Text'), ':');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
