import { act, cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Deck } from '../deck/Deck.tsx';
import { Slide } from '../slide/Slide.tsx';
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
  });

  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(document, 'fullscreenElement');
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

  it('expands the notes without navigating', async () => {
    const user = userEvent.setup();
    renderDeck();
    const [shown] = notes();
    const button = within(shown ?? document.body).getByRole('button');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    await user.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(window.location.hash).toBe('#slide=1');
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
