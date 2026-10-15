import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Deck } from '../deck/Deck.tsx';
import { Notes } from '../notes/Notes.tsx';
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

/**
 * Makes `window.open` return the window of an iframe, which jsdom can render
 * into, as the audience window.
 */
function fakeAudienceWindow() {
  const iframe = document.createElement('iframe');
  document.body.append(iframe);
  const audience = iframe.contentWindow;
  if (audience === null) {
    throw new Error('No window for the iframe');
  }
  const close = vi.fn(() => {
    audience.dispatchEvent(new Event('pagehide'));
  });
  stub('close', audience, close);
  stub('requestFullscreen', audience.document.documentElement, () =>
    Promise.resolve(),
  );
  const open = vi.spyOn(window, 'open').mockReturnValue(audience);
  return {
    audience,
    open,
    close,
    remove: () => {
      iframe.remove();
    },
  };
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
    vi.restoreAllMocks();
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

  it('shows the slides on another screen in an audience window', async () => {
    stub('isExtended', window.screen, true);
    const getScreenDetails = vi.fn(() =>
      Promise.resolve({ screens: [laptop, projector], currentScreen: laptop }),
    );
    stub('getScreenDetails', window, getScreenDetails);
    const { audience, open, remove } = fakeAudienceWindow();
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
    expect(open).toHaveBeenCalledWith(
      '',
      'slider-audience',
      expect.stringContaining('fullscreen'),
    );
    // This window stays as it is.
    expect(requestFullscreen).not.toHaveBeenCalled();
    expect(audience.document.body.textContent).toContain('First');
    remove();
  });

  it('shows the slides in this window on its own screen', async () => {
    stub('isExtended', window.screen, true);
    stub('getScreenDetails', window, () =>
      Promise.resolve({ screens: [laptop, projector], currentScreen: laptop }),
    );
    const open = vi.spyOn(window, 'open');
    const user = userEvent.setup();
    renderDeck();
    await user.keyboard('p');
    const external = await screen.findByRole('radio', { name: /Screen 2/ });
    await waitFor(() => {
      expect(document.activeElement).toBe(external);
    });
    await user.keyboard('{ArrowUp}{Enter}');
    expect(requestFullscreen).toHaveBeenCalledWith({ navigationUI: 'hide' });
    expect(open).not.toHaveBeenCalled();
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

describe('the presenter view', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '#');
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  function renderDeck() {
    render(
      <Deck>
        <Slide title="First">
          <Notes>Some notes</Notes>
        </Slide>
        <Slide title="Second" />
      </Deck>,
    );
  }

  it('mirrors the slides without controls', async () => {
    const { audience, open, remove } = fakeAudienceWindow();
    const user = userEvent.setup();
    renderDeck();
    await user.keyboard('{Shift>}P{/Shift}');
    expect(open).toHaveBeenCalledWith(
      '',
      'slider-audience',
      expect.not.stringContaining('fullscreen'),
    );
    const body = audience.document.body;
    expect(body.textContent).toContain('First');
    expect(body.textContent).not.toContain('Some notes');
    expect(body.querySelector('button')).toBeNull();
    expect(body.querySelector('[data-slider-view="audience"]')).not.toBeNull();
    // This window becomes the presenter view.
    expect(
      document.querySelector('[data-slider-view="presenter"]'),
    ).not.toBeNull();
    await user.keyboard('{ArrowRight}');
    expect(body.textContent).toContain('Second');
    remove();
  });

  it('forwards keys from the audience window', async () => {
    const { audience, remove } = fakeAudienceWindow();
    const user = userEvent.setup();
    renderDeck();
    await user.keyboard('{Shift>}P{/Shift}');
    act(() => {
      audience.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight' }),
      );
    });
    expect(window.location.hash).toBe('#slide=2');
    remove();
  });

  it.each(['this', 'the audience'])(
    'closes on Escape in %s window',
    async (which) => {
      const { audience, close, remove } = fakeAudienceWindow();
      const user = userEvent.setup();
      renderDeck();
      await user.keyboard('{Shift>}P{/Shift}');
      expect(
        document.querySelector('[data-slider-view="presenter"]'),
      ).not.toBeNull();
      if (which === 'this') {
        await user.keyboard('{Escape}');
      } else {
        act(() => {
          audience.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Escape' }),
          );
        });
      }
      expect(close).toHaveBeenCalled();
      expect(
        document.querySelector('[data-slider-view="audience"]'),
      ).not.toBeNull();
      remove();
    },
  );

  it('closes when the audience window is closed', async () => {
    const { audience, remove } = fakeAudienceWindow();
    const user = userEvent.setup();
    renderDeck();
    await user.keyboard('{Shift>}P{/Shift}');
    act(() => {
      audience.dispatchEvent(new Event('pagehide'));
    });
    expect(
      document.querySelector('[data-slider-view="audience"]'),
    ).not.toBeNull();
    remove();
  });
});
