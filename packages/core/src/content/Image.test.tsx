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

  it('shows the caption of block images in a figure', () => {
    render(
      <Deck>
        <Slide>
          <Image src="a.svg" block caption="Captioned" data-testid="figure" />
          <Image
            src="b.svg"
            alt="Tree"
            block
            caption="Both"
            data-testid="both"
          />
          <Image src="c.svg" caption="Ignored" data-testid="inline" />
          <Image src="d.svg" block data-testid="decorative" />
        </Slide>
      </Deck>,
    );
    const img = (testId: string) => {
      const element = screen.getByTestId(testId).querySelector('img');
      if (element === null) throw new Error(`Missing image ${testId}`);
      return element;
    };
    const figure = screen.getByTestId('figure');
    expect(figure.tagName).toBe('FIGURE');
    expect(figure.querySelector('figcaption')?.textContent).toBe('Captioned');
    // The caption stands in for the alt text.
    expect(img('figure').hasAttribute('alt')).toBe(false);
    expect(img('both').getAttribute('alt')).toBe('Tree');
    expect(screen.getByTestId('inline').tagName).toBe('SPAN');
    expect(screen.queryByText('Ignored')).toBeNull();
    expect(img('decorative').getAttribute('alt')).toBe('');
    expect(screen.getByTestId('decorative').tagName).toBe('DIV');
  });
});
