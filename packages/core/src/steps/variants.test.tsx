import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { ThemeProvider } from '@mui/material';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Deck } from '../deck/Deck.tsx';
import { Slide } from '../slide/Slide.tsx';
import { createSlideTheme } from '../theme/createSlideTheme.ts';
import { Step, stepClasses, type StepVariant } from './Step.tsx';
import type { StepAppearances } from './stepAppearance.ts';

/**
 * Returns how `element` looks, including what it inherits from the elements
 * it's inside.
 */
function appearanceOf(element: Element): string {
  if (element.closest(`.${stepClasses.hidden}`) !== null) {
    return 'hidden';
  }
  return element.closest(`.${stepClasses.dimmed}`) === null
    ? 'shown'
    : 'dimmed';
}

/** Returns the phase and the appearance of the step showing `text`. */
function stateOf(text: string): string {
  const element = screen.getByText(text);
  const phase =
    ['future', 'current', 'parent', 'past'].find((name) =>
      element.classList.contains(stepClasses[name as 'future']),
    ) ?? '?';
  return `${phase} ${appearanceOf(element)}`;
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

  describe('nesting with in', () => {
    function renderCallouts(
      parentVariant: StepVariant,
      calloutVariant: StepVariant,
    ) {
      return render(
        <Deck>
          <Slide title="Callouts">
            <Step group="a" variant={parentVariant}>
              A
            </Step>
            <Step group="b">B</Step>
            <Step in="a" variant={calloutVariant}>
              X
            </Step>
            <Step in="a" variant={calloutVariant}>
              Y
            </Step>
          </Slide>
        </Deck>,
      );
    }

    it('places the steps after the step they are nested in', async () => {
      const user = userEvent.setup();
      renderCallouts('reveal', 'reveal');
      const states = () => ['A', 'X', 'Y', 'B'].map(stateOf);
      await user.keyboard('{ArrowRight}');
      expect(states()).toEqual([
        'current shown',
        'future hidden',
        'future hidden',
        'future hidden',
      ]);
      await user.keyboard('{ArrowRight}');
      expect(states()).toEqual([
        'parent shown',
        'current shown',
        'future hidden',
        'future hidden',
      ]);
      await user.keyboard('{ArrowRight}{ArrowRight}');
      expect(states()).toEqual([
        'past shown',
        'past shown',
        'past shown',
        'current shown',
      ]);
    });

    it('marks steps whose parent is current as open', async () => {
      const user = userEvent.setup();
      renderCallouts('reveal', 'reveal');
      const isOpen = () =>
        screen.getByText('X').classList.contains(stepClasses.open);
      expect(isOpen()).toBe(false);
      await user.keyboard('{ArrowRight}');
      expect(isOpen()).toBe(true);
      await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');
      expect(isOpen()).toBe(false);
      expect(screen.getByText('A').classList.contains(stepClasses.open)).toBe(
        true,
      );
    });

    it('looks at least as hidden as the step it is nested in', async () => {
      const user = userEvent.setup();
      renderCallouts('only', 'focus');
      // Hidden with the future parent, although focus would only dim it.
      expect(stateOf('X')).toBe('future hidden');
      await user.keyboard('{ArrowRight}');
      expect([stateOf('X'), stateOf('Y')]).toEqual([
        'future dimmed',
        'future dimmed',
      ]);
      await user.keyboard('{ArrowRight}');
      expect([stateOf('X'), stateOf('Y')]).toEqual([
        'current shown',
        'future dimmed',
      ]);
      await user.keyboard('{ArrowRight}');
      expect([stateOf('X'), stateOf('Y')]).toEqual([
        'past dimmed',
        'current shown',
      ]);
      // Hidden with the parent once it's past.
      await user.keyboard('{ArrowRight}');
      expect([stateOf('A'), stateOf('X'), stateOf('Y')]).toEqual([
        'past hidden',
        'past hidden',
        'past hidden',
      ]);
    });

    it('keeps hiding nested steps after their turn', async () => {
      const user = userEvent.setup();
      renderCallouts('reveal', 'only');
      await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}');
      expect([stateOf('A'), stateOf('X')]).toEqual([
        'past shown',
        'past hidden',
      ]);
    });

    it('combines the DOM and in', async () => {
      const user = userEvent.setup();
      render(
        <Deck>
          <Slide title="Both">
            <Step group="a" variant="only">
              A
            </Step>
            <Step variant="preview" data-testid="b">
              <Step in="a">X</Step>
            </Step>
          </Slide>
        </Deck>,
      );
      await user.keyboard('{ArrowRight}{ArrowRight}');
      // Dimmed with B, which comes later and previews its content.
      expect(stateOf('X')).toBe('current dimmed');
      // Hidden with A once it's past, although B shows it.
      await user.keyboard('{ArrowRight}');
      expect([
        stateOf('A'),
        appearanceOf(screen.getByTestId('b')),
        stateOf('X'),
      ]).toEqual(['past hidden', 'shown', 'past hidden']);
    });
  });

  it('takes the appearances of variants from the theme', async () => {
    const user = userEvent.setup();
    const theme = createSlideTheme({
      stepVariants: {
        dim: {
          future: 'dimmed',
          current: 'shown',
          parent: 'shown',
          past: 'hidden',
        },
      },
    });
    render(
      <Deck theme={theme}>
        <Slide title="Steps">
          <Step group="a" variant="dim">
            A
          </Step>
          <Step>B</Step>
          <Step in="a">X</Step>
        </Slide>
      </Deck>,
    );
    expect(stateOf('A')).toBe('future dimmed');
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');
    // Hidden with A, which the theme hides after its turn.
    expect([stateOf('A'), stateOf('X')]).toEqual([
      'past hidden',
      'past hidden',
    ]);
  });

  it('ranks appearances added by the theme', async () => {
    const user = userEvent.setup();
    const theme = createSlideTheme({
      stepAppearances: { faded: 50 } as Record<string, number>,
      stepVariants: {
        dim: {
          future: 'hidden',
          current: 'shown',
          parent: 'shown',
          past: 'faded' as 'dimmed',
        },
      },
    });
    render(
      <Deck theme={theme}>
        <Slide title="Steps">
          <Step group="a" variant="dim">
            A
          </Step>
          <Step>B</Step>
          <Step in="a">X</Step>
          <Step in="a" variant="focus">
            Y
          </Step>
        </Slide>
      </Deck>,
    );
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}');
    const classesOf = (text: string) => screen.getByText(text).className;
    // Faded with A, since reveal would show it.
    expect(classesOf('A')).toContain('SliderStep-faded');
    expect(classesOf('X')).toContain('SliderStep-faded');
    // Dimmed is more hidden than faded.
    expect(classesOf('Y')).toContain('SliderStep-dimmed');
    expect(classesOf('Y')).not.toContain('SliderStep-faded');
  });

  it('takes variants from shorthands', async () => {
    const user = userEvent.setup();
    const theme = createSlideTheme({
      stepVariants: {
        ghost: {
          future: 'dimmed',
          current: 'shown',
          parent: 'shown',
          past: 'hidden',
        },
      } as Record<string, StepAppearances>,
    });
    const ghost = { ghost: '' } as Record<string, string>;
    render(
      <Deck theme={theme}>
        <Slide title="Steps">
          <Step only>A</Step>
          <Step {...ghost}>B</Step>
          <Step only variant="preview">
            C
          </Step>
          <Step only={false}>D</Step>
        </Slide>
      </Deck>,
    );
    expect([stateOf('B'), stateOf('C')]).toEqual([
      'future dimmed',
      'future dimmed',
    ]);
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}');
    expect([stateOf('A'), stateOf('B'), stateOf('D')]).toEqual([
      'past hidden',
      'past hidden',
      'current shown',
    ]);
    expect(screen.getByText('A').hasAttribute('only')).toBe(false);
    expect(screen.getByText('B').hasAttribute('ghost')).toBe(false);
  });
});
