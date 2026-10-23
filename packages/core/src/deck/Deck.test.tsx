import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Deck } from './Deck.tsx';
import { useSeminarOptions } from './SeminarOptionsContext.ts';
import { Slide } from '../slide/Slide.tsx';
import { Step } from '../steps/Step.tsx';
import { Together } from '../steps/Together.tsx';

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

  it('provides its options to the slides', () => {
    function Options() {
      return (
        <>{JSON.stringify([useSeminarOptions('a'), useSeminarOptions('b')])}</>
      );
    }
    render(
      <Deck options={{ a: { x: 1 } }}>
        <Slide>
          <Options />
        </Slide>
      </Deck>,
    );
    expect(screen.getByText('[{"x":1},null]')).toBeDefined();
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

  it('skips spare slides, unless going from one', async () => {
    const user = userEvent.setup();
    render(
      <Deck>
        <Slide title="First" />
        <Slide title="Detour" spare />
        <Slide title="Second" />
        <Slide title="Backup" spare />
        <Slide title="More backup" spare />
      </Deck>,
    );
    await user.keyboard('{ArrowRight}');
    expect(window.location.hash).toBe('#slide=3');
    // There are only spare slides after the last one.
    await user.keyboard('{ArrowRight}{PageDown}');
    expect(window.location.hash).toBe('#slide=3');
    await user.keyboard('{ArrowLeft}');
    expect(window.location.hash).toBe('#slide=1');
    await user.keyboard('{End}');
    expect(window.location.hash).toBe('#slide=3');
    // Going to a spare slide goes through the slides after it.
    navigateTo('#slide=4');
    await user.keyboard('{ArrowRight}');
    expect(window.location.hash).toBe('#slide=5');
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(window.location.hash).toBe('#slide=3');
    navigateTo('#slide=2');
    await user.keyboard('{ArrowRight}');
    expect(window.location.hash).toBe('#slide=3');
  });

  it('starts at the first slide that is not spare', () => {
    render(
      <Deck>
        <Slide title="Detour" spare />
        <Slide title="First" />
      </Deck>,
    );
    expect(window.location.hash).toBe('#slide=2');
    cleanup();
    window.history.replaceState(null, '', '#');
    render(
      <Deck>
        <Slide title="Backup" spare />
        <Slide title="More backup" spare />
      </Deck>,
    );
    expect(window.location.hash).toBe('#slide=1');
  });

  it('goes to slides by their aliases', () => {
    render(
      <Deck>
        <Slide title="First" />
        <Slide id="second" aliases={['part', 'second']} title="Second" />
      </Deck>,
    );
    navigateTo('#part');
    // The location hash shows the id of the slide.
    expect(window.location.hash).toBe('#second');
  });

  it('only goes through the steps in the range of slides', async () => {
    const user = userEvent.setup();
    render(
      <Deck>
        <Slide title="First" />
        <Slide title="Second" after="1" before="4">
          <Step>a</Step>
          <Step>b</Step>
          <Step>c</Step>
          <Step>d</Step>
        </Slide>
        <Slide title="Third" />
      </Deck>,
    );
    await user.keyboard('{ArrowRight}');
    expect(window.location.hash).toBe('#slide=2&step=2');
    await user.keyboard('{ArrowRight}');
    expect(window.location.hash).toBe('#slide=2&step=3');
    // Step 4 is past the end of the range.
    await user.keyboard('{ArrowRight}');
    expect(window.location.hash).toBe('#slide=3');
    await user.keyboard('{ArrowLeft}');
    expect(window.location.hash).toBe('#slide=2&step=3');
    await user.keyboard('{Shift>}{Home}{/Shift}');
    expect(window.location.hash).toBe('#slide=2&step=2');
    await user.keyboard('{ArrowLeft}');
    expect(window.location.hash).toBe('#slide=1');
    // Steps outside the range can be shown explicitly.
    navigateTo('#slide=2&step=4');
    await user.keyboard('{ArrowLeft}');
    expect(window.location.hash).toBe('#slide=2&step=3');
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

  it('can be skipped to its slide without leaving it', () => {
    renderDeck();
    navigateTo('#second');
    expect(screen.getByRole('main').id).toBe('seminar-slides');
    navigateTo('#seminar-slides');
    expect(currentTitle()).toBe('Second');
    expect(window.location.hash).toBe('#second');
  });

  it('follows changes of the location hash', () => {
    renderDeck();
    navigateTo('#slide=3');
    expect(currentTitle()).toBe('Third');
    navigateTo('#second');
    expect(currentTitle()).toBe('Second');
  });

  it('stays on the current slide when slides are added before it', () => {
    window.history.replaceState(null, '', '#second');
    const { rerender } = renderDeck();
    rerender(
      <Deck>
        <Slide title="Added" />
        <Slide title="First" />
        <Slide id="second" title="Second" />
      </Deck>,
    );
    expect(currentTitle()).toBe('Second');
    expect(window.location.hash).toBe('#second');
  });

  it('stays on the current slide when its id changes', () => {
    window.history.replaceState(null, '', '#second');
    const { rerender } = render(
      <Deck>
        <Slide id="first" title="First" />
        <Slide id="second" title="Second" />
        <Slide id="third" title="Third" />
      </Deck>,
    );
    rerender(
      <Deck>
        <Slide id="added" title="Added" />
        <Slide id="first" title="First" />
        <Slide id="renamed" title="Renamed" />
        <Slide id="third" title="Third" />
      </Deck>,
    );
    expect(currentTitle()).toBe('Renamed');
    expect(window.location.hash).toBe('#renamed');
  });

  it('stays on a named step when steps are added before it', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <Deck>
        <Slide title="Steps">
          <Step>a</Step>
          <Step group="named">b</Step>
        </Slide>
      </Deck>,
    );
    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(window.location.hash).toBe('#slide=1&step=named');
    rerender(
      <Deck>
        <Slide title="Steps">
          <Step>added</Step>
          <Step>a</Step>
          <Step group="named">b</Step>
        </Slide>
      </Deck>,
    );
    expect(window.location.hash).toBe('#slide=1&step=named');
    expect(screen.getByText('b').classList).toContain('SeminarStep-current');
  });

  it('stays on a named step when its group is renamed', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <Deck>
        <Slide title="Steps">
          <Step>a</Step>
          <Step group="named">b</Step>
          <Step>c</Step>
        </Slide>
      </Deck>,
    );
    await user.keyboard('{ArrowRight}{ArrowRight}');
    rerender(
      <Deck>
        <Slide title="Steps">
          <Step>a</Step>
          <Step group="renamed">b</Step>
          <Step>c</Step>
        </Slide>
      </Deck>,
    );
    expect(window.location.hash).toBe('#slide=1&step=renamed');
    expect(screen.getByText('b').classList).toContain('SeminarStep-current');
  });

  it('stays on an unnamed step when steps are added before it', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <Deck>
        <Slide title="Steps">
          <Step>a</Step>
          <Step>b</Step>
          <Step>c</Step>
        </Slide>
      </Deck>,
    );
    await user.keyboard('{ArrowRight}{ArrowRight}');
    rerender(
      <Deck>
        <Slide title="Steps">
          <Step>added</Step>
          <Step>a</Step>
          <Step>b</Step>
          <Step>c</Step>
        </Slide>
      </Deck>,
    );
    expect(window.location.hash).toBe('#slide=1&step=3');
    expect(screen.getByText('b').classList).toContain('SeminarStep-current');
  });

  it('stays on the step that keeps the most of its text', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <Deck>
        <Slide title="Steps">
          <Step>a</Step>
          <Together>
            <Step>b</Step>
            <Step>c</Step>
            <Step>d</Step>
          </Together>
        </Slide>
      </Deck>,
    );
    await user.keyboard('{ArrowRight}{ArrowRight}');
    // One element of the step moved to a step of its own before it.
    rerender(
      <Deck>
        <Slide title="Steps">
          <Step>added</Step>
          <Step>a</Step>
          <Step>c</Step>
          <Together>
            <Step>b</Step>
            <Step>d</Step>
            <Step>edited</Step>
          </Together>
        </Slide>
      </Deck>,
    );
    expect(window.location.hash).toBe('#slide=1&step=4');
    expect(screen.getByText('b').classList).toContain('SeminarStep-current');
  });

  it('stays on a step from the location hash when steps are added', () => {
    window.history.replaceState(null, '', '#slide=1&step=2');
    const { rerender } = render(
      <Deck>
        <Slide title="Steps">
          <Step>a</Step>
          <Step>b</Step>
        </Slide>
      </Deck>,
    );
    rerender(
      <Deck>
        <Slide title="Steps">
          <Step>added</Step>
          <Step>a</Step>
          <Step>b</Step>
        </Slide>
      </Deck>,
    );
    expect(window.location.hash).toBe('#slide=1&step=3');
  });

  it('stays on a named step from the location hash when it is renamed', () => {
    window.history.replaceState(null, '', '#slide=1&step=named');
    const { rerender } = render(
      <Deck>
        <Slide title="Steps">
          <Step>a</Step>
          <Step group="named">b</Step>
        </Slide>
      </Deck>,
    );
    rerender(
      <Deck>
        <Slide title="Steps">
          <Step>a</Step>
          <Step group="renamed">b</Step>
        </Slide>
      </Deck>,
    );
    expect(window.location.hash).toBe('#slide=1&step=renamed');
    expect(screen.getByText('b').classList).toContain('SeminarStep-current');
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
