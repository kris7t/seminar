import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Deck } from '../deck/Deck.tsx';
import { Slide } from '../slide/Slide.tsx';

function fakeScreen(label: string, isInternal: boolean) {
  return {
    label,
    isInternal,
    isPrimary: isInternal,
    width: 1920,
    height: 1080,
    left: 0,
    top: 0,
    devicePixelRatio: 1,
  };
}

const laptop = fakeScreen('Built-in Retina Display', true);
const projector = fakeScreen('', false);

function stub(name: string, target: object, value: unknown) {
  Object.defineProperty(target, name, { configurable: true, value });
}

describe('starting the presentation', () => {
  const requestFullscreen = vi.fn<(options?: object) => Promise<void>>();

  beforeEach(() => {
    window.history.replaceState(null, '', '#');
    requestFullscreen.mockReset().mockResolvedValue(undefined);
    stub('requestFullscreen', document.documentElement, requestFullscreen);
  });

  afterEach(() => {
    cleanup();
    for (const [name, target] of [
      ['requestFullscreen', document.documentElement],
      ['isExtended', window.screen],
      ['getScreenDetails', window],
      ['fullscreenElement', document],
      ['exitFullscreen', document],
    ] as const) {
      Reflect.deleteProperty(target, name);
    }
  });

  function renderDeck() {
    render(
      <Deck>
        <Slide title="First" />
      </Deck>,
    );
  }

  it('shows the page in full screen with a single screen', async () => {
    const user = userEvent.setup();
    renderDeck();
    await user.keyboard('p');
    expect(requestFullscreen).toHaveBeenCalledWith({ navigationUI: 'hide' });
  });

  it('asks which screen to use with several screens', async () => {
    stub('isExtended', window.screen, true);
    const getScreenDetails = vi.fn(() =>
      Promise.resolve({ screens: [laptop, projector], currentScreen: laptop }),
    );
    stub('getScreenDetails', window, getScreenDetails);
    const user = userEvent.setup();
    renderDeck();
    await user.keyboard('p');
    expect(getScreenDetails).toHaveBeenCalledOnce();
    expect(
      await screen.findByRole('dialog', { name: 'Start presentation' }),
    ).toBeDefined();
    expect(screen.getByText('Built-in Retina Display')).toBeDefined();
    // The other screen is selected and focused.
    const external = screen.getByRole('radio', { name: /Screen 2/ });
    expect(external).toHaveProperty('checked', true);
    await waitFor(() => {
      expect(document.activeElement).toBe(external);
    });
    await user.click(screen.getByRole('button', { name: 'OK' }));
    expect(requestFullscreen).toHaveBeenCalledWith({
      navigationUI: 'hide',
      screen: projector,
    });
  });

  it('chooses a screen with the keyboard', async () => {
    stub('isExtended', window.screen, true);
    stub('getScreenDetails', window, () =>
      Promise.resolve({ screens: [laptop, projector], currentScreen: laptop }),
    );
    const user = userEvent.setup();
    renderDeck();
    await user.keyboard('p');
    const external = await screen.findByRole('radio', { name: /Screen 2/ });
    await waitFor(() => {
      expect(document.activeElement).toBe(external);
    });
    await user.keyboard('{ArrowUp}{Enter}');
    expect(requestFullscreen).toHaveBeenCalledWith({
      navigationUI: 'hide',
      screen: laptop,
    });
  });

  it('falls back to full screen if the screens are not allowed', async () => {
    stub('isExtended', window.screen, true);
    stub('getScreenDetails', window, () =>
      Promise.reject(new DOMException('Denied', 'NotAllowedError')),
    );
    const user = userEvent.setup();
    renderDeck();
    await user.keyboard('p');
    await waitFor(() => {
      expect(requestFullscreen).toHaveBeenCalledWith({
        navigationUI: 'hide',
      });
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('stops the presentation', async () => {
    stub('fullscreenElement', document, document.documentElement);
    const exitFullscreen = vi.fn(() => Promise.resolve());
    stub('exitFullscreen', document, exitFullscreen);
    const user = userEvent.setup();
    renderDeck();
    await user.keyboard('p');
    expect(exitFullscreen).toHaveBeenCalledOnce();
    expect(requestFullscreen).not.toHaveBeenCalled();
  });
});
