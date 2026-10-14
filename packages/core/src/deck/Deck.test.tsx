import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Deck } from './Deck.tsx';
import { Slide } from '../slide/Slide.tsx';

function renderDeck() {
  return render(
    <Deck>
      <Slide title="First">
        <a href="#second">To second</a>
        <a href="#slide=3">To third</a>
        <a href="#slide=1">To first</a>
        <a href="#missing">To missing</a>
      </Slide>
      <Slide id="second" title="Second">
        <a href="#slide=1">Back to first</a>
      </Slide>
      <Slide title="Third" />
    </Deck>,
  );
}

function navigateTo(hash: string) {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

function currentTitle(): string | null {
  return screen.getByRole('heading').textContent;
}

describe('Deck', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '#');
  });

  afterEach(() => {
    cleanup();
  });

  it('shows the first slide initially', () => {
    renderDeck();
    expect(currentTitle()).toBe('First');
    expect(window.location.hash).toBe('#slide=1');
  });

  it('navigates with the keyboard', async () => {
    const user = userEvent.setup();
    renderDeck();
    await user.keyboard('{ArrowRight}');
    expect(currentTitle()).toBe('Second');
    expect(window.location.hash).toBe('#second');
    await user.keyboard('{ArrowLeft}');
    expect(currentTitle()).toBe('First');
    await user.keyboard('{End}');
    expect(currentTitle()).toBe('Third');
    expect(window.location.hash).toBe('#slide=3');
  });

  it('stays within the bounds of the deck', async () => {
    const user = userEvent.setup();
    renderDeck();
    await user.keyboard('{ArrowLeft}');
    expect(currentTitle()).toBe('First');
    await user.keyboard('{End}{ArrowRight}{ArrowLeft}');
    expect(currentTitle()).toBe('Second');
  });

  it('starts at the slide in the location hash', () => {
    window.history.replaceState(null, '', '#slide=3');
    renderDeck();
    expect(currentTitle()).toBe('Third');
  });

  it('starts at the slide with the id in the location hash', () => {
    window.history.replaceState(null, '', '#second');
    renderDeck();
    expect(currentTitle()).toBe('Second');
  });

  it('ignores unknown slide ids', () => {
    window.history.replaceState(null, '', '#missing');
    renderDeck();
    expect(currentTitle()).toBe('First');
    expect(window.location.hash).toBe('#slide=1');
  });

  it('follows changes of the location hash', () => {
    renderDeck();
    navigateTo('#slide=3');
    expect(currentTitle()).toBe('Third');
    navigateTo('#second');
    expect(currentTitle()).toBe('Second');
  });

  it('accepts slide numbers for slides with an id', () => {
    renderDeck();
    navigateTo('#slide=2');
    expect(currentTitle()).toBe('Second');
    expect(window.location.hash).toBe('#second');
  });

  describe('links to slides', () => {
    it('follow links to slide ids', async () => {
      const user = userEvent.setup();
      renderDeck();
      await user.click(screen.getByText('To second'));
      await waitFor(() => {
        expect(currentTitle()).toBe('Second');
      });
      expect(window.location.hash).toBe('#second');
    });

    it('follow links to slide numbers', async () => {
      const user = userEvent.setup();
      renderDeck();
      await user.click(screen.getByText('To third'));
      await waitFor(() => {
        expect(currentTitle()).toBe('Third');
      });
      expect(window.location.hash).toBe('#slide=3');
    });

    it('follow links back and forth', async () => {
      const user = userEvent.setup();
      renderDeck();
      await user.click(screen.getByText('To second'));
      await user.click(await screen.findByText('Back to first'));
      await waitFor(() => {
        expect(currentTitle()).toBe('First');
      });
      expect(window.location.hash).toBe('#slide=1');
    });

    it('keep the canonical hash for links to the current slide', () => {
      renderDeck();
      navigateTo('#slide=2');
      navigateTo('#slide=2');
      expect(currentTitle()).toBe('Second');
      expect(window.location.hash).toBe('#second');
    });

    it('restore the hash after links to unknown slides', async () => {
      const user = userEvent.setup();
      renderDeck();
      await user.click(screen.getByText('To missing'));
      await waitFor(() => {
        expect(window.location.hash).toBe('#slide=1');
      });
      expect(currentTitle()).toBe('First');
    });

    it('restore the hash after links past the last slide', () => {
      renderDeck();
      navigateTo('#slide=3');
      navigateTo('#slide=99');
      expect(currentTitle()).toBe('Third');
      expect(window.location.hash).toBe('#slide=3');
    });
  });
});
