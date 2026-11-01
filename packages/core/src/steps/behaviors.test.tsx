import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { ThemeProvider } from '@mui/material';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Paragraph } from '../content/Paragraph.tsx';
import { Deck } from '../deck/Deck.tsx';
import { Slide } from '../slide/Slide.tsx';
import { createSlideTheme } from '../theme/createSlideTheme.ts';
import { Step, stepClasses, type StepBehavior } from './Step.tsx';
import type { StepDefaults } from './stepDefaults.ts';
import type { StepAppearances } from './stepAppearance.ts';
import { useStep } from './useSteps.ts';

/**
 * Returns how `element` looks, including what it inherits from the elements
 * it's inside.
 */
function appearanceOf(element: Element): string {
  if (element.closest(`.${stepClasses.collapsed}`) !== null) {
    return 'collapsed';
  }
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
    ['distantFuture', 'future', 'current', 'open', 'past', 'distantPast'].find(
      (name) => element.classList.contains(stepClasses[name as 'future']),
    ) ?? '?';
  return `${phase} ${appearanceOf(element)}`;
}

function renderSlide(behavior?: StepBehavior, slideBehavior?: StepBehavior) {
  return render(
    <Deck>
      <Slide title="Steps" {...(slideBehavior ? { steps: slideBehavior } : {})}>
        <Step behavior={behavior}>
          A<Step behavior={behavior}>B</Step>
        </Step>
        <Step behavior={behavior}>C</Step>
      </Slide>
    </Deck>,
  );
}

describe('step behaviors', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '#');
  });

  afterEach(() => {
    cleanup();
  });

  describe('of content that is not a step', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it.each([
      ['with="parent"', { with: 'parent', only: true }],
      ['step={false}', { step: false, behavior: 'only' }],
    ] as const)('warns about a behavior with %s', (_name, props) => {
      const warn = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);
      render(
        <Deck>
          <Slide>
            <Step {...props}>A</Step>
          </Slide>
        </Deck>,
      );
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Ignoring the behavior `only`'),
      );
      expect(appearanceOf(screen.getByText('A'))).toBe('shown');
    });

    it('warns about a behavior of the theme', () => {
      const warn = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);
      const theme = createSlideTheme({
        stepBehaviors: { ghost: { past: 'dimmed' } },
      } as never);
      render(
        <ThemeProvider theme={theme}>
          <Deck>
            <Slide>
              <Step with="parent" {...{ ghost: true }}>
                A
              </Step>
            </Slide>
          </Deck>
        </ThemeProvider>,
      );
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Ignoring the behavior `ghost`'),
      );
    });

    it('has no default behavior with a default of joins', () => {
      // @ts-expect-error -- Content that isn't a step has no behavior.
      const defaults: StepDefaults = { joins: 'content', behavior: 'only' };
      expect(defaults.joins).toBe('content');
    });

    it('does not warn about a default behavior', () => {
      const warn = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);
      render(
        <Deck>
          <Slide>
            <Step with="parent" defaults={{ behavior: 'only' }}>
              A
            </Step>
            <Step step={false} defaults={{ behavior: 'only' }}>
              B
            </Step>
          </Slide>
        </Deck>,
      );
      expect(warn).not.toHaveBeenCalled();
    });
  });

  describe('with the styles of the slide', () => {
    it('hides elements of a hook with its class', () => {
      function Note() {
        const { ref, className } = useStep();
        return (
          <div ref={ref} className={className}>
            Note
          </div>
        );
      }
      render(
        <Deck>
          <Slide>
            <Note />
          </Slide>
        </Deck>,
      );
      expect(getComputedStyle(screen.getByText('Note')).visibility).toBe(
        'hidden',
      );
    });

    it('styles appearances of the theme', () => {
      const theme = createSlideTheme({
        stepAppearances: { faded: 50 },
        stepAppearanceStyles: { faded: { color: 'rgb(1, 2, 3)' } },
        stepBehaviors: { fade: { future: 'faded' } },
      } as never);
      render(
        <Deck theme={theme}>
          <Slide steps={'fade' as StepBehavior}>
            <Step>A</Step>
          </Slide>
        </Deck>,
      );
      expect(getComputedStyle(screen.getByText('A')).color).toBe(
        'rgb(1, 2, 3)',
      );
    });

    it('keeps the styles of a theme to its own deck', () => {
      const themeOf = (color: string) =>
        createSlideTheme({
          stepAppearances: { faded: 50 },
          stepAppearanceStyles: { faded: { color } },
          stepBehaviors: { fade: { future: 'faded' } },
        } as never);
      render(
        <>
          <Deck theme={themeOf('rgb(1, 1, 1)')}>
            <Slide steps={'fade' as StepBehavior}>
              <Step>First</Step>
            </Slide>
          </Deck>
          <Deck theme={themeOf('rgb(2, 2, 2)')}>
            <Slide steps={'fade' as StepBehavior}>
              <Step>Second</Step>
            </Slide>
          </Deck>
        </>,
      );
      expect(getComputedStyle(screen.getByText('First')).color).toBe(
        'rgb(1, 1, 1)',
      );
      expect(getComputedStyle(screen.getByText('Second')).color).toBe(
        'rgb(2, 2, 2)',
      );
    });
  });

  describe('of steppers', () => {
    function Stepper({ behavior }: { behavior?: StepBehavior }) {
      const { ref } = useStep({ behavior });
      return (
        <div ref={ref}>
          <Paragraph>Inside</Paragraph>
        </div>
      );
    }

    it('takes the default of the slide without a behavior', () => {
      render(
        <Deck>
          <Slide>
            <Stepper />
          </Slide>
        </Deck>,
      );
      expect(appearanceOf(screen.getByText('Inside'))).toBe('hidden');
    });

    it('keeps content shown with the behavior always', async () => {
      const user = userEvent.setup();
      render(
        <Deck>
          <Slide steps="only">
            <Stepper behavior="always" />
            <Step>Next</Step>
          </Slide>
        </Deck>,
      );
      expect(appearanceOf(screen.getByText('Inside'))).toBe('shown');
      await user.keyboard('{ArrowRight}{ArrowRight}');
      expect(appearanceOf(screen.getByText('Inside'))).toBe('shown');
    });
  });

  describe('of steps without one of their own', () => {
    it('looks like the rest of its group or stepper', async () => {
      const user = userEvent.setup();
      function Linked() {
        const handle = useStep();
        return (
          <>
            <Step only with={handle}>
              Handle only
            </Step>
            <Step with={handle}>Handle plain</Step>
          </>
        );
      }
      render(
        <Deck>
          <Slide>
            <Step group="a" only>
              Group only
            </Step>
            <Step group="a">Group plain</Step>
            <Linked />
            <Step>End</Step>
          </Slide>
        </Deck>,
      );
      await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');
      expect(appearanceOf(screen.getByText('Group only'))).toBe('hidden');
      expect(appearanceOf(screen.getByText('Group plain'))).toBe('hidden');
      expect(appearanceOf(screen.getByText('Handle only'))).toBe('hidden');
      expect(appearanceOf(screen.getByText('Handle plain'))).toBe('hidden');
    });
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
      parentBehavior: StepBehavior,
      calloutBehavior: StepBehavior,
    ) {
      return render(
        <Deck>
          <Slide title="Callouts">
            <Step group="a" behavior={parentBehavior}>
              A
            </Step>
            <Step group="b">B</Step>
            <Step in="a" behavior={calloutBehavior}>
              X
            </Step>
            <Step in="a" behavior={calloutBehavior}>
              Y
            </Step>
          </Slide>
        </Deck>,
      );
    }

    it('collapses steps nested in collapsed steps', async () => {
      const user = userEvent.setup();
      renderCallouts('swap', 'reveal');
      expect(stateOf('X')).toBe('distantFuture collapsed');
      expect(getComputedStyle(screen.getByText('X')).display).toBe('none');
      await user.keyboard('{ArrowRight}{ArrowRight}');
      expect([stateOf('A'), stateOf('X')]).toEqual([
        'open shown',
        'current shown',
      ]);
      // Collapsed with the parent once it's past, rather than only hidden.
      await user.keyboard('{ArrowRight}{ArrowRight}');
      expect([stateOf('A'), stateOf('X'), stateOf('Y')]).toEqual([
        'past collapsed',
        'distantPast collapsed',
        'distantPast collapsed',
      ]);
    });
  });

  it('takes behaviors from shorthands', async () => {
    const user = userEvent.setup();
    const theme = createSlideTheme({
      stepBehaviors: {
        ghost: { future: 'dimmed', past: 'hidden' },
      } as Record<string, StepAppearances>,
    });
    const ghost = { ghost: '' } as Record<string, string>;
    render(
      <Deck theme={theme}>
        <Slide title="Steps">
          <Step only>A</Step>
          <Step {...ghost}>B</Step>
          <Step only behavior="preview">
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
