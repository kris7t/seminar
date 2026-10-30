import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { Button } from '@mui/material';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Deck } from '../deck/Deck.tsx';
import type { SeminarHost } from '../host/SeminarHost.ts';
import { Notes } from '../notes/Notes.tsx';
import { Slide } from '../slide/Slide.tsx';
import { Step } from '../steps/Step.tsx';
import { SLIDE_HEIGHT, SLIDE_WIDTH } from '../theme/createSlideTheme.ts';
import { cursorShape, POINTER_IDLE_TIMEOUT } from './mirror/pointer.tsx';
import { formatElapsed } from './PresenterToolbar.tsx';
import { useSlideView } from '../view/SlideViewContext.ts';
import { useSlideState } from '../state/useSlideState.ts';

function fakeScreen(label: string, isInternal: boolean, left = 0) {
  return {
    label,
    isInternal,
    isPrimary: isInternal,
    width: 1920,
    height: 1080,
    left,
    top: 0,
    availLeft: left,
    availTop: 0,
    availWidth: 1920,
    availHeight: 1080,
    devicePixelRatio: 1,
  };
}

const laptop = fakeScreen('Built-in Retina Display', true);
const projector = fakeScreen('', false);
/** A projector to the right of the laptop. */
const rightProjector = fakeScreen('', false, 1920);

/**
 * Returns the screens of the device, as `getScreenDetails` does, with the
 * screen of this window, which can change later.
 */
function screenDetails<T>(screens: T[], currentScreen: T) {
  return Object.assign(new EventTarget(), { screens, currentScreen });
}

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
      ['seminarHost', window],
    ] as const) {
      Reflect.deleteProperty(target, name);
    }
  });

  function renderDeck() {
    render(
      <Deck defaultMirrorPointer>
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
      Promise.resolve(screenDetails([laptop, projector], laptop)),
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
      'seminar-audience',
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
      Promise.resolve(screenDetails([laptop, projector], laptop)),
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

  it('starts right away if the host of the deck says so', () => {
    const host: SeminarHost = { present: true };
    Object.assign(window, { seminarHost: host });
    renderDeck();
    expect(requestFullscreen).toHaveBeenCalledWith({ navigationUI: 'hide' });
  });

  it('lets the host of the deck allow starting by itself first', async () => {
    let activated: () => void = () => undefined;
    const activate = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          activated = resolve;
        }),
    );
    const host: SeminarHost = { present: true, activate };
    Object.assign(window, { seminarHost: host });
    renderDeck();
    expect(activate).toHaveBeenCalledOnce();
    expect(requestFullscreen).not.toHaveBeenCalled();
    await act(async () => {
      activated();
      await Promise.resolve();
    });
    expect(requestFullscreen).toHaveBeenCalledWith({ navigationUI: 'hide' });
  });

  it('starts only once if the host says so in strict mode', () => {
    const host: SeminarHost = { present: true };
    Object.assign(window, { seminarHost: host });
    // Like the pages of decks, which run effects twice in development.
    render(
      <StrictMode>
        <Deck>
          <Slide title="First" />
        </Deck>
      </StrictMode>,
    );
    expect(requestFullscreen).toHaveBeenCalledOnce();
  });

  it('tells the host when the presentation leaves full screen', () => {
    const presentationEnded = vi.fn();
    const host: SeminarHost = { presentationEnded };
    Object.assign(window, { seminarHost: host });
    stub('fullscreenElement', document, document.documentElement);
    renderDeck();
    expect(presentationEnded).not.toHaveBeenCalled();
    stub('fullscreenElement', document, null);
    act(() => {
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    expect(presentationEnded).toHaveBeenCalledOnce();
  });

  it('tells the host when the audience window closes', async () => {
    stub('isExtended', window.screen, true);
    stub('getScreenDetails', window, () =>
      Promise.resolve(screenDetails([laptop, projector], laptop)),
    );
    const presentationEnded = vi.fn();
    const host: SeminarHost = { presentationEnded };
    Object.assign(window, { seminarHost: host });
    const { remove } = fakeAudienceWindow();
    const user = userEvent.setup();
    renderDeck();
    await user.keyboard('p');
    await user.click(await screen.findByRole('button', { name: 'OK' }));
    expect(presentationEnded).not.toHaveBeenCalled();
    await user.keyboard('p');
    expect(presentationEnded).toHaveBeenCalledOnce();
    remove();
  });

  it('tells the host when choosing the screen is cancelled', async () => {
    stub('isExtended', window.screen, true);
    stub('getScreenDetails', window, () =>
      Promise.resolve(screenDetails([laptop, projector], laptop)),
    );
    const presentationEnded = vi.fn();
    const host: SeminarHost = { presentationEnded };
    Object.assign(window, { seminarHost: host });
    const user = userEvent.setup();
    renderDeck();
    await user.keyboard('p');
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(presentationEnded).toHaveBeenCalledOnce();
  });

  it('says in the title if the host shows a preview of the deck', () => {
    document.title = 'Deck';
    const host: SeminarHost = { preview: true };
    Object.assign(window, { seminarHost: host });
    renderDeck();
    expect(document.title).toBe('Deck (Preview)');
    expect(requestFullscreen).not.toHaveBeenCalled();
    cleanup();
    expect(document.title).toBe('Deck');
  });

  it('asks the host of the deck which screen this window is on', async () => {
    stub('isExtended', window.screen, true);
    stub('getScreenDetails', window, () =>
      Promise.resolve(screenDetails([laptop, rightProjector], laptop)),
    );
    const host: SeminarHost = {
      currentScreen: () =>
        Promise.resolve({ left: 1920, top: 0, width: 1920, height: 1080 }),
    };
    Object.assign(window, { seminarHost: host });
    const user = userEvent.setup();
    renderDeck();
    await user.keyboard('p');
    expect(
      await screen.findByRole('radio', { name: /Built-in Retina Display/ }),
    ).toHaveProperty('checked', true);
    expect(
      screen.getByRole('radio', { name: /Screen 2.*this window is here/ }),
    ).toBeDefined();
  });

  it('lets the host of the deck place the audience before full screen', async () => {
    stub('isExtended', window.screen, true);
    stub('getScreenDetails', window, () =>
      Promise.resolve(screenDetails([laptop, rightProjector], laptop)),
    );
    let placed: () => void = () => undefined;
    const placeAudience = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          placed = resolve;
        }),
    );
    const host: SeminarHost = { placeAudience };
    Object.assign(window, { seminarHost: host });
    const { audience, remove } = fakeAudienceWindow();
    const audienceFullscreen = vi.fn(() => Promise.resolve());
    stub(
      'requestFullscreen',
      audience.document.documentElement,
      audienceFullscreen,
    );
    const user = userEvent.setup();
    renderDeck();
    await user.keyboard('p');
    await user.click(await screen.findByRole('button', { name: 'OK' }));
    expect(placeAudience).toHaveBeenCalledWith({
      left: 1920,
      top: 0,
      width: 1920,
      height: 1080,
    });
    expect(audienceFullscreen).not.toHaveBeenCalled();
    await act(async () => {
      placed();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(audienceFullscreen).toHaveBeenCalledOnce();
    });
    remove();
  });

  it('notices the window moving to another screen while choosing', async () => {
    stub('isExtended', window.screen, true);
    const details = screenDetails([laptop, rightProjector], laptop);
    stub('getScreenDetails', window, () => Promise.resolve(details));
    const { open, remove } = fakeAudienceWindow();
    const user = userEvent.setup();
    renderDeck();
    await user.keyboard('p');
    expect(
      await screen.findByRole('radio', {
        name: /Built-in.*this window is here/,
      }),
    ).toBeDefined();
    act(() => {
      details.currentScreen = rightProjector;
      details.dispatchEvent(new Event('currentscreenchange'));
    });
    expect(
      await screen.findByRole('radio', {
        name: /Screen 2.*this window is here/,
      }),
    ).toBeDefined();
    // The screen where the window was is another screen now.
    await user.click(screen.getByRole('radio', { name: /Built-in/ }));
    await user.click(screen.getByRole('button', { name: 'OK' }));
    expect(open).toHaveBeenCalledWith(
      '',
      'seminar-audience',
      expect.stringContaining('left=0'),
    );
    expect(requestFullscreen).not.toHaveBeenCalled();
    remove();
  });

  it('asks the host of the deck again where this window is', async () => {
    stub('isExtended', window.screen, true);
    stub('getScreenDetails', window, () =>
      Promise.resolve(screenDetails([laptop, rightProjector], laptop)),
    );
    let area = { left: 0, top: 0, width: 1920, height: 1080 };
    const host: SeminarHost = { currentScreen: () => Promise.resolve(area) };
    Object.assign(window, { seminarHost: host });
    const { open, remove } = fakeAudienceWindow();
    const user = userEvent.setup();
    renderDeck();
    await user.keyboard('p');
    expect(
      await screen.findByRole('radio', {
        name: /Built-in.*this window is here/,
      }),
    ).toBeDefined();
    area = { left: 1920, top: 0, width: 1920, height: 1080 };
    expect(
      await screen.findByRole(
        'radio',
        { name: /Screen 2.*this window is here/ },
        { timeout: 2000 },
      ),
    ).toBeDefined();
    await user.click(screen.getByRole('radio', { name: /Built-in/ }));
    await user.click(screen.getByRole('button', { name: 'OK' }));
    await waitFor(() => {
      expect(open).toHaveBeenCalledWith(
        '',
        'seminar-audience',
        expect.stringContaining('left=0'),
      );
    });
    expect(requestFullscreen).not.toHaveBeenCalled();
    remove();
  });

  it('leaves the full screen of the audience to the host of the deck', async () => {
    stub('isExtended', window.screen, true);
    stub('getScreenDetails', window, () =>
      Promise.resolve(screenDetails([laptop, rightProjector], laptop)),
    );
    const showsAudienceFullscreen = vi.fn(() => true);
    const host: SeminarHost = { showsAudienceFullscreen };
    Object.assign(window, { seminarHost: host });
    const { audience, remove } = fakeAudienceWindow();
    const audienceFullscreen = vi.fn(() => Promise.resolve());
    stub(
      'requestFullscreen',
      audience.document.documentElement,
      audienceFullscreen,
    );
    const user = userEvent.setup();
    renderDeck();
    await user.keyboard('p');
    await user.click(await screen.findByRole('button', { name: 'OK' }));
    expect(audience.document.body.textContent).toContain('First');
    expect(showsAudienceFullscreen).toHaveBeenCalledWith({
      left: 1920,
      top: 0,
      width: 1920,
      height: 1080,
    });
    expect(audienceFullscreen).not.toHaveBeenCalled();
    remove();
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
      <Deck defaultMirrorPointer>
        <Slide title="First">
          <Notes>Some notes</Notes>
        </Slide>
        <Slide title="Second" />
      </Deck>,
    );
  }

  it('mirrors the slides without controls', async () => {
    document.title = 'Deck';
    const { audience, open, remove } = fakeAudienceWindow();
    const user = userEvent.setup();
    renderDeck();
    await user.keyboard('{Shift>}P{/Shift}');
    expect(open).toHaveBeenCalledWith(
      '',
      'seminar-audience',
      expect.not.stringContaining('fullscreen'),
    );
    expect(audience.document.title).toBe('Deck');
    expect(document.title).toBe('Deck (Presenter view)');
    const body = audience.document.body;
    expect(body.textContent).toContain('First');
    expect(body.textContent).not.toContain('Some notes');
    expect(body.querySelector('button')).toBeNull();
    expect(body.querySelector('[data-seminar-view="audience"]')).not.toBeNull();
    // This window becomes the presenter view.
    expect(
      document.querySelector('[data-seminar-view="presenter"]'),
    ).not.toBeNull();
    await user.keyboard('{ArrowRight}');
    expect(body.textContent).toContain('Second');
    remove();
  });

  it('shows the next step and the notes in a panel', async () => {
    const { remove } = fakeAudienceWindow();
    const user = userEvent.setup();
    render(
      <Deck defaultMirrorPointer>
        <Slide title="First">
          <Step>Revealed</Step>
          <Notes>Some notes</Notes>
        </Slide>
        <Slide title="Second" />
      </Deck>,
    );
    expect(screen.queryByRole('complementary')).toBeNull();
    await user.keyboard('{Shift>}P{/Shift}');
    const panel = screen.getByRole('complementary', { name: 'Presenter view' });
    const toolbar = screen.getByRole('toolbar', { name: 'Presenter controls' });
    expect(toolbar.textContent).toContain('1 / 2');
    expect(panel.textContent).toContain('Some notes');
    expect(panel.textContent).toContain('Next step');
    // The preview shows the step, which is still hidden on the slide.
    const preview = panel.querySelector('[data-seminar-view="preview"]');
    expect(preview?.textContent).toContain('Revealed');
    expect(
      getComputedStyle(screen.getAllByText('Revealed')[0] ?? document.body)
        .visibility,
    ).toBe('hidden');
    await user.keyboard('{ArrowRight}');
    expect(panel.textContent).toContain('Next slide');
    expect(
      panel.querySelector('[data-seminar-view="preview"]')?.textContent,
    ).toContain('Second');
    await user.keyboard('{ArrowRight}');
    expect(panel.textContent).toContain('End of the presentation');
    expect(toolbar.textContent).toContain('2 / 2');
    expect(panel.textContent).toContain('No notes');
    remove();
  });

  it('mirrors the pointer over the slide', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { audience, remove } = fakeAudienceWindow();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderDeck();
    await user.keyboard('{Shift>}P{/Shift}');
    const frame = document.querySelector('[data-seminar-view="presenter"]');
    if (!(frame instanceof HTMLElement)) {
      throw new Error('No presenter view');
    }
    // The slide is shown at half size.
    vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(100, 50, SLIDE_WIDTH / 2, SLIDE_HEIGHT / 2),
    );
    const pointer = () =>
      audience.document.querySelector<SVGElement>('[data-seminar-pointer]');
    expect(pointer()).toBeNull();
    fireEvent.pointerMove(frame, {
      pointerType: 'mouse',
      clientX: 150,
      clientY: 100,
    });
    expect(pointer()?.style.translate).toBe('100px 100px');
    expect(pointer()?.dataset['cursor']).toBe('default');
    const link = document.createElement('span');
    link.style.cursor = 'pointer';
    frame.append(link);
    fireEvent.pointerMove(link, {
      pointerType: 'mouse',
      clientX: 150,
      clientY: 100,
    });
    expect(pointer()?.dataset['cursor']).toBe('pointer');
    link.remove();
    // Touch doesn't hover.
    fireEvent.pointerMove(frame, {
      pointerType: 'touch',
      clientX: 200,
      clientY: 100,
    });
    expect(pointer()?.style.translate).toBe('100px 100px');
    fireEvent.pointerLeave(frame, { pointerType: 'mouse' });
    expect(pointer()).toBeNull();
    fireEvent.pointerMove(frame, {
      pointerType: 'mouse',
      clientX: 150,
      clientY: 100,
    });
    expect(pointer()).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(POINTER_IDLE_TIMEOUT);
    });
    expect(pointer()).toBeNull();
    vi.useRealTimers();
    remove();
  });

  it('only mirrors the pointer when the deck says so', async () => {
    const { audience, remove } = fakeAudienceWindow();
    const user = userEvent.setup();
    render(
      <Deck>
        <Slide title="First" />
      </Deck>,
    );
    await user.keyboard('{Shift>}P{/Shift}');
    const frame = document.querySelector('[data-seminar-view="presenter"]');
    if (!(frame instanceof HTMLElement)) {
      throw new Error('No presenter view');
    }
    fireEvent.pointerMove(frame, {
      pointerType: 'mouse',
      clientX: 10,
      clientY: 10,
    });
    expect(
      audience.document.querySelector('[data-seminar-pointer]'),
    ).toBeNull();
    expect(
      screen
        .getByRole('button', { name: 'Show pointer to the audience' })
        .getAttribute('aria-pressed'),
    ).toBe('false');
    remove();
  });

  it('switches between pointer modes', async () => {
    const { audience, remove } = fakeAudienceWindow();
    const user = userEvent.setup();
    renderDeck();
    await user.keyboard('{Shift>}P{/Shift}');
    const frame = document.querySelector('[data-seminar-view="presenter"]');
    if (!(frame instanceof HTMLElement)) {
      throw new Error('No presenter view');
    }
    vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, SLIDE_WIDTH, SLIDE_HEIGHT),
    );
    const move = () => {
      fireEvent.pointerMove(frame, {
        pointerType: 'mouse',
        clientX: 10,
        clientY: 10,
      });
    };
    const shown = (doc: Document) =>
      doc
        .querySelector('[data-seminar-pointer]')
        ?.getAttribute('data-seminar-pointer') ?? 'none';
    const mirror = screen.getByRole('button', {
      name: 'Show pointer to the audience',
    });
    const laser = screen.getByRole('button', { name: 'Laser pointer' });
    expect(mirror.getAttribute('aria-pressed')).toBe('true');
    move();
    expect(shown(audience.document)).toBe('mirror');
    // Only the audience sees the mirrored pointer.
    expect(shown(document)).toBe('none');
    await user.keyboard('m');
    expect(mirror.getAttribute('aria-pressed')).toBe('false');
    expect(shown(audience.document)).toBe('none');
    move();
    expect(shown(audience.document)).toBe('none');
    // The pointer shows up without moving it.
    await user.keyboard('l');
    expect(laser.getAttribute('aria-pressed')).toBe('true');
    expect(shown(audience.document)).toBe('laser');
    expect(shown(document)).toBe('laser');
    // Turning the laser off goes back to no pointer.
    await user.click(laser);
    expect(shown(audience.document)).toBe('none');
    await user.click(mirror);
    expect(shown(audience.document)).toBe('mirror');
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
      document.title = 'Deck';
      const { audience, close, remove } = fakeAudienceWindow();
      const user = userEvent.setup();
      renderDeck();
      await user.keyboard('{Shift>}P{/Shift}');
      expect(
        document.querySelector('[data-seminar-view="presenter"]'),
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
      expect(document.title).toBe('Deck');
      expect(
        document.querySelector('[data-seminar-view="audience"]'),
      ).not.toBeNull();
      remove();
    },
  );

  it('first unfocuses the focused element on Escape', async () => {
    const { close, remove } = fakeAudienceWindow();
    const user = userEvent.setup();
    render(
      <Deck defaultMirrorPointer>
        <Slide title="First">
          <input aria-label="Field" />
        </Slide>
      </Deck>,
    );
    await user.keyboard('{Shift>}P{/Shift}');
    const field = screen.getByLabelText('Field');
    await user.click(field);
    await user.keyboard('{Escape}');
    expect(document.activeElement).not.toBe(field);
    expect(close).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    expect(close).toHaveBeenCalled();
    remove();
  });

  it('closes when the audience window is closed', async () => {
    const { audience, remove } = fakeAudienceWindow();
    const user = userEvent.setup();
    renderDeck();
    await user.keyboard('{Shift>}P{/Shift}');
    act(() => {
      audience.dispatchEvent(new Event('pagehide'));
    });
    expect(
      document.querySelector('[data-seminar-view="audience"]'),
    ).not.toBeNull();
    remove();
  });
});

describe('the presenter toolbar', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '#');
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('navigates and keeps time', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { remove } = fakeAudienceWindow();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <Deck defaultMirrorPointer>
        <Slide title="First">
          <Step>a</Step>
        </Slide>
        <Slide title="Second" />
      </Deck>,
    );
    await user.keyboard('{Shift>}P{/Shift}');
    const toolbar = screen.getByRole('toolbar', { name: 'Presenter controls' });
    const elapsed = screen.getByLabelText('Time elapsed');
    expect(elapsed.textContent).toBe('0:00');
    await user.click(screen.getByRole('button', { name: 'Next step' }));
    expect(window.location.hash).toBe('#slide=1&step=1');
    // Clicking doesn't take the focus, so Space keeps navigating.
    expect(toolbar.contains(document.activeElement)).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Next slide' }));
    expect(window.location.hash).toBe('#slide=2');
    act(() => {
      vi.advanceTimersByTime(65_000);
    });
    expect(elapsed.textContent).toBe('1:05');
    await user.click(
      screen.getByRole('button', { name: 'Reset time elapsed' }),
    );
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(elapsed.textContent).toBe('0:01');
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(elapsed.textContent).toBe('0:06');
    await user.keyboard('r');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(elapsed.textContent).toBe('0:01');
    await user.click(screen.getByRole('button', { name: 'Menu' }));
    await user.click(
      screen.getByRole('menuitem', { name: /Reset time elapsed/ }),
    );
    expect(elapsed.textContent).toBe('0:00');
    const focusNotes = screen.getByRole('button', { name: 'Focus on notes' });
    expect(focusNotes.getAttribute('aria-pressed')).toBe('false');
    const panel = screen.getByRole('complementary', { name: 'Presenter view' });
    expect(panel.textContent).toContain('End of the presentation');
    await user.click(focusNotes);
    expect(focusNotes.getAttribute('aria-pressed')).toBe('true');
    expect(panel.textContent).not.toContain('End of the presentation');
    expect(panel.textContent).toContain('Notes');
    await user.keyboard('n');
    expect(focusNotes.getAttribute('aria-pressed')).toBe('false');
    expect(panel.textContent).toContain('End of the presentation');
    const overview = screen.getByRole('button', { name: 'Slide overview' });
    expect(overview.getAttribute('aria-pressed')).toBe('false');
    await user.click(overview);
    expect(
      screen.getByRole('region', { name: 'Slide overview' }),
    ).toBeDefined();
    expect(overview.getAttribute('aria-pressed')).toBe('true');
    await user.click(overview);
    expect(screen.queryByRole('region', { name: 'Slide overview' })).toBeNull();
    expect(overview.getAttribute('aria-pressed')).toBe('false');
    remove();
  });

  it('navigates on clicks on the panel, but not on the toolbar', async () => {
    const { remove } = fakeAudienceWindow();
    const user = userEvent.setup();
    render(
      <Deck defaultMirrorPointer>
        <Slide title="First">
          <Step>a</Step>
          <Notes>Some notes</Notes>
        </Slide>
        <Slide title="Second" />
      </Deck>,
    );
    await user.keyboard('{Shift>}P{/Shift}');
    await user.click(screen.getByText('Notes'));
    expect(window.location.hash).toBe('#slide=1&step=1');
    await user.click(screen.getByLabelText('Time elapsed'));
    expect(window.location.hash).toBe('#slide=1&step=1');
    // Clicks on the notes select them instead.
    await user.click(screen.getByText('Some notes'));
    expect(window.location.hash).toBe('#slide=1&step=1');
    await user.keyboard('s');
    await user.click(screen.getByText('Notes'));
    expect(window.location.hash).toBe('#slide=1&step=1');
    remove();
  });

  it('has the menu with the settings of the presenter view', async () => {
    const { remove } = fakeAudienceWindow();
    const user = userEvent.setup();
    render(
      <Deck defaultMirrorPointer>
        <Slide title="First" />
      </Deck>,
    );
    await user.keyboard('{Shift>}P{/Shift}');
    const toolbar = screen.getByRole('toolbar', { name: 'Presenter controls' });
    const menuButton = screen.getByRole('button', { name: 'Menu' });
    expect(toolbar.contains(menuButton)).toBe(true);
    await user.click(menuButton);
    const laser = screen.getByRole('menuitemcheckbox', {
      name: 'Laser pointer',
    });
    expect(laser.getAttribute('aria-checked')).toBe('false');
    expect(
      screen
        .getByRole('menuitemcheckbox', { name: 'Show pointer to the audience' })
        .getAttribute('aria-checked'),
    ).toBe('true');
    expect(
      screen
        .getByRole('menuitemcheckbox', { name: 'Presenter view' })
        .getAttribute('aria-checked'),
    ).toBe('true');
    await user.click(laser);
    expect(
      screen
        .getByRole('button', { name: 'Laser pointer' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    remove();
  });

  it('toggles the table of contents and text selection in the toolbar', async () => {
    const { remove } = fakeAudienceWindow();
    const user = userEvent.setup();
    render(
      <Deck defaultMirrorPointer toc={[{ slide: 0, title: 'First' }]}>
        <Slide title="First" />
      </Deck>,
    );
    await user.keyboard('{Shift>}P{/Shift}');
    const toc = screen.getByRole('button', { name: 'Table of contents' });
    expect(toc.getAttribute('aria-pressed')).toBe('false');
    await user.click(toc);
    expect(toc.getAttribute('aria-pressed')).toBe('true');
    const selection = screen.getByRole('button', { name: 'Text selection' });
    expect(selection.getAttribute('aria-pressed')).toBe('false');
    await user.click(selection);
    expect(selection.getAttribute('aria-pressed')).toBe('true');
    await user.keyboard('s');
    expect(selection.getAttribute('aria-pressed')).toBe('false');
    remove();
  });

  /** Returns the buttons of the toolbar in a presenter view of `width`. */
  async function toolbarButtons(width: number) {
    // Stubbed in the setup, which vi.unstubAllGlobals would undo.
    const original = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      readonly #callback: ResizeObserverCallback;
      constructor(callback: ResizeObserverCallback) {
        this.#callback = callback;
      }
      observe() {
        this.#callback(
          [{ contentRect: { width, height: 800 } } as ResizeObserverEntry],
          this as unknown as ResizeObserver,
        );
      }
      disconnect() {
        // Nothing to stop observing.
      }
    } as unknown as typeof ResizeObserver;
    const { remove } = fakeAudienceWindow();
    try {
      const user = userEvent.setup();
      render(
        <Deck defaultMirrorPointer>
          <Slide title="First" />
        </Deck>,
      );
      await user.keyboard('{Shift>}P{/Shift}');
      const toolbar = screen.getByRole('toolbar', {
        name: 'Presenter controls',
      });
      return [...toolbar.querySelectorAll('button')].map(
        (button) => button.getAttribute('aria-label') ?? button.textContent,
      );
    } finally {
      remove();
      globalThis.ResizeObserver = original;
    }
  }

  it('leaves out buttons not specific to the presenter view if narrower', async () => {
    expect(await toolbarButtons(700)).toEqual([
      'Previous slide',
      'Previous step',
      'Go to slide (G)',
      'Next step',
      'Next slide',
      'Focus on notes',
      'Show pointer to the audience',
      'Laser pointer',
      'Reset time elapsed',
      'Menu',
    ]);
  });

  it('only has the slide number, the time, and the menu if narrow', async () => {
    expect(await toolbarButtons(600)).toEqual([
      'Go to slide (G)',
      'Reset time elapsed',
      'Menu',
    ]);
  });
});

describe('cursorShape', () => {
  function shapeOf(element: HTMLElement, cursor: string) {
    element.style.cursor = cursor;
    document.body.append(element);
    const shape = cursorShape(element);
    element.remove();
    return shape;
  }

  it('reads the cursor of the element', () => {
    const span = document.createElement('span');
    expect(shapeOf(span, 'text')).toBe('text');
    expect(shapeOf(span, 'url(hand.png), pointer')).toBe('pointer');
    expect(shapeOf(span, 'grabbing')).toBe('grab');
    expect(shapeOf(span, 'wait')).toBe('default');
  });

  it('shows a caret over text fields', () => {
    expect(shapeOf(document.createElement('input'), 'auto')).toBe('text');
    expect(shapeOf(document.createElement('span'), 'auto')).toBe('default');
  });
});

describe('formatElapsed', () => {
  it('shows hours only when needed', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(65_000)).toBe('1:05');
    expect(formatElapsed(3_725_000)).toBe('1:02:05');
  });
});

describe('mirroring the interaction', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '#');
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shares transient state with the audience for one visit, including presenter-view toggles', async () => {
    const { audience, remove } = fakeAudienceWindow();
    const user = userEvent.setup();
    function Counter() {
      const [value, setValue] = useSlideState(0, { transient: true });
      return (
        <button
          onClick={() => {
            setValue(value + 1);
          }}
        >
          Mirror {value}
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
    await user.click(screen.getByRole('button', { name: 'Mirror 0' }));
    await user.keyboard('{Shift>}P{/Shift}');
    expect(audience.document.querySelector('button')?.textContent).toBe(
      'Mirror 1',
    );
    await user.keyboard('{Shift>}P{/Shift}');
    expect(
      document.querySelector('[data-seminar-view="presenter"]'),
    ).toBeNull();
    expect(screen.getByRole('button', { name: 'Mirror 1' })).toBeDefined();
    await user.keyboard('{Shift>}P{/Shift}');
    expect(audience.document.querySelector('button')?.textContent).toBe(
      'Mirror 1',
    );
    await user.keyboard('{PageDown}');
    expect(screen.getByRole('heading', { name: 'Second' })).toBeDefined();
    await user.keyboard('{PageUp}');
    expect(screen.getByRole('button', { name: 'Mirror 0' })).toBeDefined();
    expect(audience.document.querySelector('button')?.textContent).toBe(
      'Mirror 0',
    );
    remove();
  });

  it('lets virtualized inputs follow pointer mirroring in the audience view', async () => {
    const { audience, remove } = fakeAudienceWindow();
    const user = userEvent.setup();
    function VirtualizedField() {
      const { interactive, mirrorPointer } = useSlideView();
      return interactive || mirrorPointer ? (
        <input aria-label="Virtual field" />
      ) : (
        <span>Static field</span>
      );
    }
    render(
      <Deck>
        <Slide title="First">
          <VirtualizedField />
        </Slide>
      </Deck>,
    );
    await user.keyboard('{Shift>}P{/Shift}');
    expect(audience.document.querySelector('input')).toBeNull();
    await user.keyboard('m');
    expect(audience.document.querySelector('input')).not.toBeNull();
    await user.click(screen.getByRole('textbox', { name: 'Virtual field' }));
    await waitFor(() => {
      expect(
        audience.document
          .querySelector('input')
          ?.hasAttribute('data-mirror-focus'),
      ).toBe(true);
    });
    await user.click(screen.getByRole('button', { name: 'Laser pointer' }));
    expect(audience.document.querySelector('input')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Laser pointer' }));
    expect(audience.document.querySelector('input')).not.toBeNull();
    await waitFor(() => {
      expect(
        audience.document
          .querySelector('input')
          ?.hasAttribute('data-mirror-focus'),
      ).toBe(true);
    });
    await user.click(
      screen.getByRole('button', { name: 'Show pointer to the audience' }),
    );
    expect(audience.document.querySelector('input')).toBeNull();
    expect(
      screen.getByRole('textbox', { name: 'Virtual field' }),
    ).toBeDefined();
    remove();
  });

  it('exposes active pointer mirroring to both presented views only while presenting', async () => {
    const { audience, remove } = fakeAudienceWindow();
    const user = userEvent.setup();
    function MirroringState() {
      const { mirrorPointer } = useSlideView();
      return <output data-testid="mirroring">{String(mirrorPointer)}</output>;
    }
    render(
      <Deck defaultMirrorPointer>
        <Slide title="First">
          <MirroringState />
        </Slide>
      </Deck>,
    );
    expect(screen.getByTestId('mirroring').textContent).toBe('false');
    await user.keyboard('{Shift>}P{/Shift}');
    expect(screen.getByTestId('mirroring').textContent).toBe('true');
    expect(audience.document.querySelector('output')?.textContent).toBe('true');
    await user.keyboard('l');
    expect(screen.getByTestId('mirroring').textContent).toBe('false');
    expect(audience.document.querySelector('output')?.textContent).toBe(
      'false',
    );
    await user.keyboard('l');
    expect(screen.getByTestId('mirroring').textContent).toBe('true');
    await user.keyboard('{Escape}');
    expect(screen.getByTestId('mirroring').textContent).toBe('false');
    remove();
  });

  it('copies the style sheets of self-contained pages to the audience window', async () => {
    const stylesheets = document.createElement('div');
    stylesheets.id = 'seminar-stylesheets';
    const style = document.createElement('style');
    style.textContent = '.copied { color: red; }';
    stylesheets.append(style);
    document.body.prepend(stylesheets);
    const { audience, remove } = fakeAudienceWindow();
    const user = userEvent.setup();
    render(
      <Deck>
        <Slide title="First" />
      </Deck>,
    );
    await user.keyboard('{Shift>}P{/Shift}');
    expect(audience.document.head.innerHTML).toContain(
      '.copied { color: red; }',
    );
    stylesheets.remove();
    remove();
  });

  it('mirrors the ripple of buttons without clicking them', async () => {
    const { audience, remove } = fakeAudienceWindow();
    const onClick = vi.fn<() => void>();
    const user = userEvent.setup();
    render(
      <Deck defaultMirrorPointer>
        <Slide title="First">
          <Button onClick={onClick}>Press</Button>
        </Slide>
      </Deck>,
    );
    await user.keyboard('{Shift>}P{/Shift}');
    const ripples = () =>
      audience.document.querySelectorAll('.MuiTouchRipple-ripple').length;
    expect(ripples()).toBe(0);
    await user.pointer({
      keys: '[MouseLeft>]',
      target: screen.getByRole('button', { name: 'Press' }),
    });
    await waitFor(() => {
      expect(ripples()).toBe(1);
    });
    await user.pointer({ keys: '[/MouseLeft]' });
    // Only the presenter view handles the click.
    expect(onClick).toHaveBeenCalledOnce();
    remove();
  });

  it('only shows focus with the mirrored pointer', async () => {
    const { audience, remove } = fakeAudienceWindow();
    const user = userEvent.setup();
    render(
      <Deck defaultMirrorPointer>
        <Slide title="First">
          <input aria-label="Field" />
        </Slide>
      </Deck>,
    );
    await user.keyboard('{Shift>}P{/Shift}');
    const mirrored = () =>
      audience.document
        .querySelector('input')
        ?.hasAttribute('data-mirror-focus');
    await user.click(screen.getByLabelText('Field'));
    await waitFor(() => {
      expect(mirrored()).toBe(true);
    });
    // The toolbar doesn't take the focus from the field.
    await user.click(screen.getByRole('button', { name: 'Laser pointer' }));
    expect(document.activeElement).toBe(screen.getByLabelText('Field'));
    await waitFor(() => {
      expect(mirrored()).toBe(false);
    });
    remove();
  });
});
