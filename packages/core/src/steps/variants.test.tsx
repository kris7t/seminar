import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { ThemeProvider } from '@mui/material';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Deck } from '../deck/Deck.tsx';
import { Slide } from '../slide/Slide.tsx';
import { createSlideTheme } from '../theme/createSlideTheme.ts';
import { Step, stepClasses, type StepVariant } from './Step.tsx';

/** Returns the phase and the appearance of the step showing `text`. */
function stateOf(text: string): string {
  const element = screen.getByText(text);
  const phase =
    ['future', 'current', 'parent', 'past'].find((name) =>
      element.classList.contains(stepClasses[name as 'future']),
    ) ?? '?';
  const appearance = element.classList.contains(stepClasses.hidden)
    ? 'hidden'
    : element.classList.contains(stepClasses.dimmed)
      ? 'dimmed'
      : 'shown';
  return `${phase} ${appearance}`;
}

function renderSlide(variant?: StepVariant, slideVariant?: StepVariant) {
  return render(
    <Deck>
      <Slide title="Steps" {...(slideVariant ? { steps: slideVariant } : {})}>
        <Step variant={variant}>
          A<Step variant={variant}>B</Step>
        </Step>
        <Step variant={variant}>C</Step>
      </Slide>
    </Deck>,
  );
}

describe('step variants', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '#');
  });

  afterEach(() => {
    cleanup();
  });

  it('tells the phases apart', async () => {
    const user = userEvent.setup();
    renderSlide();
    expect([stateOf('A'), stateOf('B'), stateOf('C')]).toEqual([
      'future hidden',
      'future hidden',
      'future hidden',
    ]);
    await user.keyboard('{ArrowRight}');
    expect([stateOf('A'), stateOf('B')]).toEqual([
      'current shown',
      'future hidden',
    ]);
    await user.keyboard('{ArrowRight}');
    expect([stateOf('A'), stateOf('B')]).toEqual([
      'parent shown',
      'current shown',
    ]);
    await user.keyboard('{ArrowRight}');
    expect([stateOf('A'), stateOf('B'), stateOf('C')]).toEqual([
      'past shown',
      'past shown',
      'current shown',
    ]);
  });

  it.each([
    ['dim', 'hidden', 'dimmed'],
    ['preview', 'dimmed', 'shown'],
    ['focus', 'dimmed', 'dimmed'],
    ['only', 'hidden', 'hidden'],
  ] as const)('styles %s steps', async (variant, future, past) => {
    const user = userEvent.setup();
    renderSlide(variant);
    expect(stateOf('C')).toBe(`future ${future}`);
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');
    expect(stateOf('A')).toBe(`past ${past}`);
    expect(stateOf('C')).toBe('current shown');
  });

  it('takes the variant from the slide', async () => {
    const user = userEvent.setup();
    renderSlide(undefined, 'dim');
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');
    expect(stateOf('A')).toBe('past dimmed');
  });

  it('prefers the slide to the default of the theme', async () => {
    const user = userEvent.setup();
    const theme = createSlideTheme({
      components: { SliderStep: { defaultProps: { variant: 'only' } } },
    });
    render(
      <ThemeProvider theme={theme}>
        <Deck theme={theme}>
          <Slide title="Steps" steps="dim">
            <Step>A</Step>
            <Step variant="reveal">B</Step>
            <Step>C</Step>
          </Slide>
        </Deck>
      </ThemeProvider>,
    );
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');
    expect([stateOf('A'), stateOf('B')]).toEqual(['past dimmed', 'past shown']);
  });

  it('dims nested steps only once', async () => {
    const user = userEvent.setup();
    renderSlide('dim');
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');
    expect(getComputedStyle(screen.getByText('A')).opacity).not.toBe('1');
    expect(getComputedStyle(screen.getByText('B')).opacity).toBe('1');
  });
});
