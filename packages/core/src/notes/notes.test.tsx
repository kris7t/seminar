import { act, cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Deck } from '../deck/Deck.tsx';
import { Slide } from '../slide/Slide.tsx';
import HUNGARIAN from '../i18n/locales/hu.ts';
import { getSlideNotes, Notes } from './Notes.tsx';

function renderDeck() {
  return render(
    <Deck>
      <Slide title="First">
        Content
        <Notes>Remember this</Notes>
      </Slide>
      <Slide title="Second" />
    </Deck>,
  );
}

/** The notes that are visible, i.e., not only rendered for measuring. */
const notes = () =>
  screen
    .queryAllByLabelText('Presenter notes')
    .filter((element) => element.getAttribute('aria-hidden') !== 'true');

describe('Notes', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '#');
    // jsdom has no layout, so the notes are taller than the black bar, which
    // has no height either, and show over the slide.
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(100);
  });

  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(document, 'fullscreenElement');
    vi.restoreAllMocks();
  });

  it('is taken from the children of slides', () => {
    expect(
      getSlideNotes(
        <Slide>
          a<Notes>b</Notes>
        </Slide>,
      ),
    ).toEqual(['b']);
    expect(getSlideNotes(<Slide>a</Slide>)).toBeUndefined();
  });

  it('is taken from the notes prop of slides', () => {
    expect(getSlideNotes(<Slide notes="b">a</Slide>)).toEqual(['b']);
    expect(
      getSlideNotes(
        <Slide notes="b">
          <Notes>c</Notes>
        </Slide>,
      ),
    ).toEqual(['b', 'c']);
  });

  it('shows the notes of the current slide instead of on the slide', async () => {
    const user = userEvent.setup();
    renderDeck();
    const [shown] = notes();
    expect(shown?.textContent).toContain('Remember this');
    // Only in the notes, not on the slide.
    expect(screen.getAllByText('Remember this')).toHaveLength(2);
    await user.keyboard('{PageDown}');
    expect(notes()).toEqual([]);
  });

  it('selects the notes in the bar below the slide on click', async () => {
    // Short enough to fit the black bar.
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(0);
    const user = userEvent.setup();
    renderDeck();
    const [shown] = notes();
    expect(shown?.querySelector('button')).toBeNull();
    await user.click(within(shown ?? document.body).getByText('Remember this'));
    expect(window.location.hash).toBe('#slide=1');
  });

  it('lets clicks through to the slide until expanded', async () => {
    const user = userEvent.setup();
    renderDeck();
    const [shown] = notes();
    expect(shown?.hasAttribute('data-slider-interactive')).toBe(false);
    await user.click(within(shown ?? document.body).getByRole('button'));
    expect(shown?.hasAttribute('data-slider-interactive')).toBe(true);
  });

  it('expands the notes without navigating', async () => {
    const user = userEvent.setup();
    renderDeck();
    const [shown] = notes();
    const button = within(shown ?? document.body).getByRole('button');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.textContent).toBe('more');
    await user.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.textContent).toBe('less');
    expect(window.location.hash).toBe('#slide=1');
  });

  it('labels the button in the language of the user interface', () => {
    render(
      <Deck lang="hu" uiLocales={[HUNGARIAN]}>
        <Slide title="Első">
          <Notes>Jegyezd meg</Notes>
        </Slide>
      </Deck>,
    );
    const button = screen.getByRole('button', { name: 'több' });
    expect(button.getAttribute('lang')).toBe('hu');
  });

  it('is hidden in full screen', () => {
    renderDeck();
    expect(notes()).not.toEqual([]);
    act(() => {
      Object.defineProperty(document, 'fullscreenElement', {
        configurable: true,
        value: document.body,
      });
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    expect(screen.queryAllByLabelText('Presenter notes')).toEqual([]);
  });
});
