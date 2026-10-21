import { cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Slide } from '../slide/Slide.tsx';
import { useDeckState } from '../state/useDeckState.ts';
import { useSlideState } from '../state/useSlideState.ts';
import { Step } from '../steps/Step.tsx';
import { Deck } from './Deck.tsx';

async function resetDeck(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Menu' }));
  const menu = within(await screen.findByRole('menu'));
  await user.click(menu.getByRole('menuitem', { name: 'Reset deck' }));
}

function State() {
  const [slide, setSlide] = useSlideState(0);
  const [deck, setDeck] = useDeckState<number>('value');
  const [mirror, setMirror] = useSlideState(0, { transient: true });
  return (
    <>
      <button
        onClick={() => {
          setSlide(slide + 1);
        }}
      >
        Slide {slide}
      </button>
      <button
        onClick={() => {
          setDeck((deck ?? 0) + 1);
        }}
      >
        Deck {deck ?? 0}
      </button>
      <button
        onClick={() => {
          setMirror(mirror + 1);
        }}
      >
        Mirror {mirror}
      </button>
    </>
  );
}

describe('resetting a deck', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '#');
  });

  afterEach(cleanup);

  it('resets every slide and recap to its own first step and shows the first non-spare slide', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '#spare&step=2');
    render(
      <Deck defaultMouseNavigation={false}>
        <Slide id="spare" title="Spare" spare>
          <State />
          <Step>One</Step>
          <Step>Two</Step>
        </Slide>
        <Slide id="original" title="Original" from="1" to="2">
          <State />
          <Step>One</Step>
          <Step>Two</Step>
          <Step>Three</Step>
          <Step>Four</Step>
          <Step>Five</Step>
          <Step>Six</Step>
        </Slide>
        <Slide id="other" title="Other">
          <State />
          <Step>Later</Step>
        </Slide>
        <Slide recap="original" id="middle" to="4" />
        <Slide recap="original" id="last" />
        <Slide recap="original" id="done" />
      </Deck>,
    );
    await user.click(screen.getByRole('button', { name: 'Slide 0' }));
    await user.keyboard('{PageDown}');
    expect(window.location.hash).toBe('#original&step=1');
    await user.click(screen.getByRole('button', { name: 'Slide 0' }));
    await user.click(screen.getByRole('button', { name: 'Deck 0' }));
    await user.keyboard('{ArrowRight}{PageDown}');
    await user.click(screen.getByRole('button', { name: 'Slide 0' }));
    await user.keyboard('{ArrowRight}{PageDown}');
    expect(window.location.hash).toBe('#middle&step=3');
    await user.keyboard('{ArrowRight}{PageDown}{ArrowRight}');
    expect(window.location.hash).toBe('#last&step=6');
    await user.keyboard('{PageDown}');
    expect(window.location.hash).toBe('#done&step=6');
    await resetDeck(user);
    expect(window.location.hash).toBe('#original&step=1');
    expect(screen.getByRole('button', { name: 'Slide 0' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Deck 0' })).toBeDefined();
    await user.keyboard('{PageDown}');
    expect(window.location.hash).toBe('#other');
    expect(screen.getByRole('button', { name: 'Slide 0' })).toBeDefined();
    await user.keyboard('{PageDown}');
    expect(window.location.hash).toBe('#middle&step=3');
    await user.keyboard('{PageDown}');
    expect(window.location.hash).toBe('#last&step=5');
    await user.keyboard('{PageDown}');
    expect(window.location.hash).toBe('#done&step=6');
    await user.keyboard('o');
    await user.click(screen.getByRole('button', { name: /^Slide 1: Spare/ }));
    expect(window.location.hash).toBe('#spare');
    expect(screen.getByRole('button', { name: 'Slide 0' })).toBeDefined();
  });

  it('resets transient state even while staying on the first slide', async () => {
    const user = userEvent.setup();
    render(
      <Deck defaultMouseNavigation={false}>
        <Slide title="First">
          <State />
          <Step>Later</Step>
        </Slide>
      </Deck>,
    );
    await user.click(screen.getByRole('button', { name: 'Mirror 0' }));
    await user.keyboard('{ArrowRight}');
    await resetDeck(user);
    expect(window.location.hash).toBe('#slide=1');
    expect(screen.getByRole('button', { name: 'Mirror 0' })).toBeDefined();
  });

  it('returns to the first slide when all slides are spare, without requiring changed state', async () => {
    const user = userEvent.setup();
    render(
      <Deck>
        <Slide title="First" spare>
          <Step>Later</Step>
        </Slide>
        <Slide title="Second" spare />
      </Deck>,
    );
    await user.keyboard('{ArrowRight}{PageDown}');
    await resetDeck(user);
    expect(window.location.hash).toBe('#slide=1');
    await user.keyboard('{PageDown}{PageUp}');
    expect(window.location.hash).toBe('#slide=1');
  });

  it('leaves the overview to show the first slide', async () => {
    const user = userEvent.setup();
    render(
      <Deck>
        <Slide title="First" />
        <Slide title="Second">
          <State />
        </Slide>
      </Deck>,
    );
    await user.keyboard('{PageDown}');
    await user.click(screen.getByRole('button', { name: 'Slide 0' }));
    await user.keyboard('o');
    expect(
      screen.getByRole('region', { name: 'Slide overview' }),
    ).toBeDefined();
    await resetDeck(user);
    expect(window.location.hash).toBe('#slide=1');
    expect(screen.queryByRole('region', { name: 'Slide overview' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'First' })).toBeDefined();
  });
});
