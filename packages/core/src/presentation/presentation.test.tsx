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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Deck } from '../deck/Deck.tsx';
import { Notes } from '../notes/Notes.tsx';
import { Slide } from '../slide/Slide.tsx';
import { Step } from '../steps/Step.tsx';
import { SLIDE_HEIGHT, SLIDE_WIDTH } from '../theme/createSlideTheme.ts';
import { cursorShape, POINTER_IDLE_TIMEOUT } from './pointer.tsx';
import { formatElapsed } from './PresenterToolbar.tsx';

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
    document.title = 'Deck';
    const { audience, open, remove } = fakeAudienceWindow();
    const user = userEvent.setup();
    renderDeck();
    await user.keyboard('{Shift>}P{/Shift}');
    expect(open).toHaveBeenCalledWith(
      '',
      'slider-audience',
      expect.not.stringContaining('fullscreen'),
    );
    expect(audience.document.title).toBe('Deck');
    expect(document.title).toBe('Deck (presenter view)');
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

  it('shows the next step and the notes in a panel', async () => {
    const { remove } = fakeAudienceWindow();
    const user = userEvent.setup();
    render(
      <Deck>
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
    const preview = panel.querySelector('[data-slider-view="preview"]');
    expect(preview?.textContent).toContain('Revealed');
    expect(
      getComputedStyle(screen.getAllByText('Revealed')[0] ?? document.body)
        .visibility,
    ).toBe('hidden');
    await user.keyboard('{ArrowRight}');
    expect(panel.textContent).toContain('Next slide');
    expect(
      panel.querySelector('[data-slider-view="preview"]')?.textContent,
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
    const frame = document.querySelector('[data-slider-view="presenter"]');
    if (!(frame instanceof HTMLElement)) {
      throw new Error('No presenter view');
    }
    // The slide is shown at half size.
    vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(100, 50, SLIDE_WIDTH / 2, SLIDE_HEIGHT / 2),
    );
    const pointer = () =>
      audience.document.querySelector<SVGElement>('[data-slider-pointer]');
    expect(pointer()).toBeNull();
    fireEvent.pointerMove(frame, {
      pointerType: 'mouse',
      clientX: 150,
      clientY: 100,
    });
    expect(pointer()?.style.left).toBe('100px');
    expect(pointer()?.style.top).toBe('100px');
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
    expect(pointer()?.style.left).toBe('100px');
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

  it('switches between pointer modes', async () => {
    const { audience, remove } = fakeAudienceWindow();
    const user = userEvent.setup();
    renderDeck();
    await user.keyboard('{Shift>}P{/Shift}');
    const frame = document.querySelector('[data-slider-view="presenter"]');
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
        .querySelector('[data-slider-pointer]')
        ?.getAttribute('data-slider-pointer') ?? 'none';
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
      expect(document.title).toBe('Deck');
      expect(
        document.querySelector('[data-slider-view="audience"]'),
      ).not.toBeNull();
      remove();
    },
  );

  it('first unfocuses the focused element on Escape', async () => {
    const { close, remove } = fakeAudienceWindow();
    const user = userEvent.setup();
    render(
      <Deck>
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
      document.querySelector('[data-slider-view="audience"]'),
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
      <Deck>
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
    await user.click(screen.getByRole('button', { name: 'Slide overview' }));
    expect(
      screen.getByRole('region', { name: 'Slide overview' }),
    ).toBeDefined();
    remove();
  });

  it('navigates on clicks on the panel, but not on the toolbar', async () => {
    const { remove } = fakeAudienceWindow();
    const user = userEvent.setup();
    render(
      <Deck>
        <Slide title="First">
          <Step>a</Step>
          <Notes>Some notes</Notes>
        </Slide>
        <Slide title="Second" />
      </Deck>,
    );
    await user.keyboard('{Shift>}P{/Shift}');
    await user.click(screen.getByText('Some notes'));
    expect(window.location.hash).toBe('#slide=1&step=1');
    await user.click(screen.getByLabelText('Time elapsed'));
    expect(window.location.hash).toBe('#slide=1&step=1');
    await user.keyboard('s');
    await user.click(screen.getByText('Some notes'));
    expect(window.location.hash).toBe('#slide=1&step=1');
    remove();
  });

  it('has the menu with the settings of the presenter view', async () => {
    const { remove } = fakeAudienceWindow();
    const user = userEvent.setup();
    render(
      <Deck>
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
    await user.click(laser);
    expect(
      screen
        .getByRole('button', { name: 'Laser pointer' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    remove();
  });

  it('only has the slide number, the time, and the menu if narrow', async () => {
    const matchMedia = window.matchMedia.bind(window);
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => {
      const list = matchMedia(query);
      Object.defineProperty(list, 'matches', {
        value: query.startsWith('(max-width'),
      });
      return list;
    });
    const { remove } = fakeAudienceWindow();
    const user = userEvent.setup();
    render(
      <Deck>
        <Slide title="First" />
      </Deck>,
    );
    await user.keyboard('{Shift>}P{/Shift}');
    const toolbar = screen.getByRole('toolbar', { name: 'Presenter controls' });
    expect(
      [...toolbar.querySelectorAll('button')].map(
        (button) => button.getAttribute('aria-label') ?? button.textContent,
      ),
    ).toEqual(['Go to slide (G)', 'Reset time elapsed', 'Menu']);
    remove();
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

  it('mirrors the ripple of buttons without clicking them', async () => {
    const { audience, remove } = fakeAudienceWindow();
    const onClick = vi.fn<() => void>();
    const user = userEvent.setup();
    render(
      <Deck>
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
      <Deck>
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
