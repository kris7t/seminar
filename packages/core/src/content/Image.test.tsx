import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Deck } from '../deck/Deck.tsx';
import { Slide } from '../slide/Slide.tsx';
import { Step, stepClasses } from '../steps/Step.tsx';
import { Image, imageClasses } from './Image.tsx';

describe('Image', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '#');
  });

  afterEach(() => {
    cleanup();
  });

  it('is shown with the previous step unless it is a step', async () => {
    const user = userEvent.setup();
    render(
      <Deck>
        <Slide>
          <Step>First</Step>
          <Image src="a.svg" alt="Inline" width={60} />
          <Image src="b.svg" alt="Block" block step />
        </Slide>
      </Deck>,
    );
    const inline = screen.getByAltText('Inline');
    const block = screen.getByAltText('Block');
    expect(inline.getAttribute('src')).toBe('a.svg');
    expect(inline.getAttribute('width')).toBe('60');
    const rootOf = (img: HTMLElement) =>
      img.closest<HTMLElement>(`.${imageClasses.root}`);
    expect(rootOf(inline)?.tagName).toBe('SPAN');
    expect(rootOf(block)?.tagName).toBe('DIV');
    await user.keyboard('{ArrowRight}');
    expect(rootOf(inline)?.classList).toContain(stepClasses.current);
    expect(rootOf(block)?.classList).toContain(stepClasses.future);
    await user.keyboard('{ArrowRight}');
    expect(window.location.hash).toBe('#slide=1&step=2');
    expect(rootOf(block)?.classList).toContain(stepClasses.current);
  });
});
