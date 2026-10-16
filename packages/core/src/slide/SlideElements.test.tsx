import { act, cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Deck } from '../deck/Deck.tsx';
import { Step, stepClasses } from '../steps/Step.tsx';
import { Slide } from './Slide.tsx';
import {
  SlideElement,
  useSlideElement,
  useSlideElementId,
} from './SlideElements.tsx';

/** Shows the id of the element called `name` in the same rendering. */
function Finder({ name }: { name: string }) {
  const element = useSlideElement(name);
  return <output data-testid="found">{element?.id ?? 'none'}</output>;
}

function IdOf({ name }: { name: string }) {
  return <data>{useSlideElementId(name)}</data>;
}

describe('SlideElement', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '#');
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('gives every rendering of a slide ids of its own', async () => {
    const user = userEvent.setup();
    render(
      <Deck>
        <Slide id="first" title="First">
          <SlideElement as="span" name="target" data-testid="target">
            Target
          </SlideElement>
          <Finder name="target" />
        </Slide>
        <Slide recap="first" />
      </Deck>,
    );
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    // The overview renders both slides again, the recap with the content of
    // the first one.
    await user.keyboard('o');
    const targets = screen.getAllByTestId('target');
    expect(targets.length).toBeGreaterThanOrEqual(2);
    const ids = targets.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^slider-[\w-]+-target$/);
    }
    // Each rendering finds its own element.
    expect(
      screen.getAllByTestId('found').map(({ textContent }) => textContent),
    ).toEqual(ids);
  });

  it('keeps names outside of slides', () => {
    render(<IdOf name="plain" />);
    expect(screen.getByText('plain')).toBeDefined();
  });

  it('warns about several elements with the same name', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    render(
      <Deck>
        <Slide>
          <SlideElement as="span" name="twice" />
          <SlideElement as="span" name="twice" />
        </Slide>
      </Deck>,
    );
    expect(warn).toHaveBeenCalledWith(
      'There are several elements called `twice` on a slide.',
    );
  });

  it('names the elements of steps, which form groups', async () => {
    const user = userEvent.setup();
    render(
      <Deck>
        <Slide>
          <Step id="parse" data-testid="parse">
            Parse
          </Step>
          <Step group="parse" data-testid="joined">
            Joined
          </Step>
          <Finder name="parse" />
        </Slide>
      </Deck>,
    );
    const parse = screen.getByTestId('parse');
    expect(parse.id).toMatch(/^slider-[\w-]+-parse$/);
    expect(screen.getByTestId('found').textContent).toBe(parse.id);
    await user.keyboard('{ArrowRight}');
    expect(window.location.hash).toBe('#slide=1&step=parse');
    expect(
      screen.getByTestId('joined').classList.contains(stepClasses.current),
    ).toBe(true);
  });
});
