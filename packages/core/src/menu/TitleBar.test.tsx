import { act, cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Deck } from '../deck/Deck.tsx';
import { Slide } from '../slide/Slide.tsx';

/** The Window Controls Overlay of a window whose title bar the page draws. */
class FakeOverlay extends EventTarget {
  visible = true;
  rect = new DOMRect(0, 0, window.innerWidth - 100, 48);

  getTitlebarAreaRect(): DOMRect {
    return this.rect;
  }

  change(changes: Partial<Pick<FakeOverlay, 'visible' | 'rect'>>): void {
    Object.assign(this, changes);
    act(() => {
      this.dispatchEvent(new Event('geometrychange'));
    });
  }
}

let overlay: FakeOverlay;

function renderDeck() {
  return render(
    <Deck>
      <Slide title="First" />
      <Slide title="Second" />
    </Deck>,
  );
}

describe('TitleBar', () => {
  beforeEach(() => {
    // Wide enough for all the buttons of the title bar.
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1280);
    window.history.replaceState(null, '', '#');
    document.title = 'My talk';
    overlay = new FakeOverlay();
    Object.defineProperty(navigator, 'windowControlsOverlay', {
      configurable: true,
      value: overlay,
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, 'windowControlsOverlay');
  });

  it('shows the title and the buttons next to the window controls', () => {
    renderDeck();
    const titleBar = screen.getByRole('banner');
    expect(titleBar.textContent).toContain('My talk');
    expect(getComputedStyle(titleBar).height).toBe('48px');
    expect(
      getComputedStyle(titleBar.lastElementChild ?? titleBar).paddingRight,
    ).toBe('100px');
    for (const name of [
      'Menu',
      'Start presentation',
      'Next slide',
      'Slide overview',
      'Steps',
      'Text selection',
    ]) {
      expect(titleBar.contains(screen.getByRole('button', { name }))).toBe(
        true,
      );
    }
  });

  it('leaves out the buttons that the menu has if they do not fit', () => {
    overlay.rect = new DOMRect(0, 0, 1000, 48);
    renderDeck();
    expect(screen.getByRole('button', { name: 'Next slide' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Slide overview' })).toBeNull();
    overlay.change({ rect: new DOMRect(0, 0, 800, 48) });
    expect(screen.queryByRole('button', { name: 'Next slide' })).toBeNull();
    expect(screen.getByRole('button', { name: /Go to slide/ })).toBeDefined();
    expect(
      screen.getByRole('button', { name: 'Start presentation' }),
    ).toBeDefined();
  });

  it('toggles the overview and the sidebar', async () => {
    const user = userEvent.setup();
    renderDeck();
    const overview = screen.getByRole('button', { name: 'Slide overview' });
    await user.click(overview);
    expect(overview.getAttribute('aria-pressed')).toBe('true');
    expect(
      screen.getByRole('region', { name: 'Slide overview' }),
    ).toBeDefined();
    await user.click(overview);
    expect(screen.queryByRole('region', { name: 'Slide overview' })).toBeNull();
    const steps = screen.getByRole('button', { name: 'Steps' });
    await user.click(steps);
    expect(steps.getAttribute('aria-pressed')).toBe('true');
    expect(
      screen.getByRole('button', { name: 'Steps', expanded: true }),
    ).toBeDefined();
  });

  it('is hidden while the window draws its title bar, e.g., in full screen', () => {
    renderDeck();
    overlay.change({ visible: false });
    expect(screen.queryByRole('banner')).toBeNull();
    // In the corner of the window instead.
    expect(screen.getByRole('button', { name: 'Menu' })).toBeDefined();
    overlay.change({ visible: true });
    expect(screen.getByRole('banner')).toBeDefined();
  });

  it('leaves room for window controls on the left', () => {
    overlay.rect = new DOMRect(100, 0, window.innerWidth - 100, 48);
    renderDeck();
    // After the background.
    const start = screen.getByRole('banner').children[1];
    expect(getComputedStyle(start ?? document.body).paddingLeft).toBe('100px');
  });

  it('covers the letterbox above the slides, unless the sidebar is open', async () => {
    const user = userEvent.setup();
    renderDeck();
    const titleBar = screen.getByRole('banner');
    // The box of the title bar, outside of the box that provides the theme.
    const box = () => titleBar.parentElement?.parentElement ?? document.body;
    const background = () => titleBar.firstElementChild ?? titleBar;
    const slides = screen.getByRole('main');
    expect(getComputedStyle(box()).position).toBe('absolute');
    expect(getComputedStyle(background()).borderBottomWidth).not.toBe('1px');
    // Below the title bar, since the letterbox has no room for it.
    expect(getComputedStyle(slides).marginTop).toBe('48px');
    await user.keyboard('{Shift>}T{/Shift}');
    // Above the sidebar, and separated from it, without being remounted.
    expect(screen.getByRole('banner')).toBe(titleBar);
    expect(getComputedStyle(box()).position).not.toBe('absolute');
    expect(getComputedStyle(background()).borderBottomWidth).toBe('1px');
    expect(getComputedStyle(slides).marginTop).not.toBe('48px');
  });

  it('spans the window above the overview', async () => {
    const user = userEvent.setup();
    renderDeck();
    await user.keyboard('o');
    const overview = screen.getByRole('region', { name: 'Slide overview' });
    expect(getComputedStyle(overview).top).toBe('48px');
    expect(screen.getAllByRole('banner')).toHaveLength(1);
  });

  it('has the toolbar of the presenter view, with the title', async () => {
    // Renders the audience window into an iframe.
    const iframe = document.createElement('iframe');
    document.body.append(iframe);
    vi.spyOn(window, 'open').mockReturnValue(iframe.contentWindow);
    const user = userEvent.setup();
    renderDeck();
    await user.keyboard('{Shift>}P{/Shift}');
    // The title bar is the toolbar.
    expect(screen.queryByRole('banner')).toBeNull();
    const toolbar = screen.getByRole('toolbar', { name: 'Presenter controls' });
    expect(toolbar.tagName).toBe('HEADER');
    expect(toolbar.textContent).toContain('1 / 2');
    expect(toolbar.textContent).toContain('My talk (Presenter view)');
    expect(screen.getAllByRole('button', { name: 'Menu' })).toHaveLength(1);
    iframe.remove();
  });
});
