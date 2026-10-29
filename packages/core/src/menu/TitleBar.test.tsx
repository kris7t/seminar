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

  it('shows the title and the menu button next to the window controls', () => {
    renderDeck();
    const titleBar = screen.getByRole('banner');
    expect(titleBar.textContent).toBe('My talk');
    expect(getComputedStyle(titleBar).height).toBe('48px');
    expect(
      getComputedStyle(titleBar.lastElementChild ?? titleBar).paddingRight,
    ).toBe('100px');
    expect(
      titleBar.contains(screen.getByRole('button', { name: 'Menu' })),
    ).toBe(true);
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

  it('leaves room for window controls on the left, or the sidebar', async () => {
    const user = userEvent.setup();
    overlay.rect = new DOMRect(100, 0, window.innerWidth - 100, 48);
    renderDeck();
    // After the background.
    const start = () => screen.getByRole('banner').children[1];
    expect(getComputedStyle(start() ?? document.body).paddingLeft).toBe(
      '100px',
    );
    await user.keyboard('{Shift>}T{/Shift}');
    expect(getComputedStyle(start() ?? document.body).paddingLeft).toBe(
      '280px',
    );
  });

  it('leaves room above the sidebar, unless it is below the title bar', async () => {
    const iframe = document.createElement('iframe');
    document.body.append(iframe);
    vi.spyOn(window, 'open').mockReturnValue(iframe.contentWindow);
    const user = userEvent.setup();
    renderDeck();
    await user.keyboard('{Shift>}T{/Shift}');
    const room = () =>
      screen
        .getByRole('button', { name: 'Steps', expanded: true })
        .closest('h2')?.parentElement?.previousElementSibling;
    expect(getComputedStyle(room() ?? document.body).height).toBe('48px');
    // The presenter view spans the window with its title bar.
    await user.keyboard('{Shift>}P{/Shift}');
    expect(room()).toBeNull();
    iframe.remove();
  });

  it('spans the window above the overview', async () => {
    const user = userEvent.setup();
    renderDeck();
    await user.keyboard('{Shift>}T{/Shift}');
    await user.keyboard('o');
    const overview = screen.getByRole('region', { name: 'Slide overview' });
    expect(getComputedStyle(overview).top).toBe('48px');
    expect(screen.getAllByRole('banner')).toHaveLength(1);
    // Outside of the box that provides the theme.
    const parent = screen.getByRole('banner').parentElement?.parentElement;
    expect(getComputedStyle(parent ?? document.body).position).toBe('fixed');
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
