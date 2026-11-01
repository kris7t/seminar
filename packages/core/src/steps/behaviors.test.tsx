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
import { rankAppearances, type StepAppearances } from './stepAppearance.ts';
import { Steps } from './Steps.tsx';
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

  describe('of joining steps', () => {
    it('looks like the step it is part of', async () => {
      const user = userEvent.setup();
      render(
        <Deck>
          <Slide>
            <Step swap>A</Step>
            <Paragraph>With A</Paragraph>
            <Step>B</Step>
          </Slide>
        </Deck>,
      );
      expect(appearanceOf(screen.getByText('With A'))).toBe('collapsed');
      await user.keyboard('{ArrowRight}');
      expect(appearanceOf(screen.getByText('With A'))).toBe('shown');
      await user.keyboard('{ArrowRight}');
      expect(appearanceOf(screen.getByText('With A'))).toBe('collapsed');
    });

    it('follows the latest step of those shown together', async () => {
      const user = userEvent.setup();
      render(
        <Deck>
          <Slide>
            <Step swap>A</Step>
            <Step dim with="previous">
              B
            </Step>
            <Paragraph>C</Paragraph>
            <Step>D</Step>
          </Slide>
        </Deck>,
      );
      await user.keyboard('{ArrowRight}{ArrowRight}');
      expect(appearanceOf(screen.getByText('A'))).toBe('collapsed');
      expect(appearanceOf(screen.getByText('B'))).toBe('dimmed');
      expect(appearanceOf(screen.getByText('C'))).toBe('dimmed');
    });

    it('ignores the behavior of the slide without a step', async () => {
      const user = userEvent.setup();
      render(
        <Deck>
          <Slide steps="dim">
            <Paragraph>Intro</Paragraph>
            <Step>
              A<Paragraph>Detail</Paragraph>
              <Step>A1</Step>
            </Step>
            <Paragraph>With A</Paragraph>
            <Step>B</Step>
          </Slide>
        </Deck>,
      );
      await user.keyboard('{ArrowRight}{ArrowRight}');
      expect(window.location.hash).toBe('#slide=1&step=1.1');
      expect(appearanceOf(screen.getByText('Intro'))).toBe('shown');
      expect(appearanceOf(screen.getByText('Detail'))).toBe('shown');
      await user.keyboard('{ArrowRight}');
      expect(appearanceOf(screen.getByText('Intro'))).toBe('shown');
      expect(appearanceOf(screen.getByText('Detail'))).toBe('dimmed');
      expect(appearanceOf(screen.getByText('With A'))).toBe('dimmed');
    });

    it('becomes a new step if it names a behavior', async () => {
      const user = userEvent.setup();
      render(
        <Deck>
          <Slide>
            <Paragraph only>A</Paragraph>
            <Paragraph only>B</Paragraph>
          </Slide>
        </Deck>,
      );
      expect(appearanceOf(screen.getByText('A'))).toBe('hidden');
      await user.keyboard('{ArrowRight}');
      expect(window.location.hash).toBe('#slide=1&step=1');
      expect(appearanceOf(screen.getByText('A'))).toBe('shown');
      expect(appearanceOf(screen.getByText('B'))).toBe('hidden');
      await user.keyboard('{ArrowRight}');
      expect(window.location.hash).toBe('#slide=1&step=2');
      expect(appearanceOf(screen.getByText('A'))).toBe('hidden');
      expect(appearanceOf(screen.getByText('B'))).toBe('shown');
    });

    it('keeps the place of a default with if it names a behavior', async () => {
      const user = userEvent.setup();
      render(
        <Deck>
          <Slide>
            <Step>A</Step>
            <Step defaults={{ with: 'content' }} only>
              B
            </Step>
            <Step>C</Step>
          </Slide>
        </Deck>,
      );
      await user.keyboard('{ArrowRight}');
      expect(appearanceOf(screen.getByText('B'))).toBe('shown');
      await user.keyboard('{ArrowRight}');
      expect(window.location.hash).toBe('#slide=1&step=2');
      expect(appearanceOf(screen.getByText('B'))).toBe('hidden');
      expect(appearanceOf(screen.getByText('A'))).toBe('shown');
    });
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

    it('looks like what encloses it, whatever behavior it has', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const user = userEvent.setup();
      render(
        <Deck>
          <Slide>
            <Step>
              A
              <Step>
                B
                <Step with="parent" only>
                  written
                </Step>
                <Step step={false} defaults={{ behavior: 'scoped' }}>
                  default
                </Step>
              </Step>
              <Step>C</Step>
            </Step>
            <Step>D</Step>
          </Slide>
        </Deck>,
      );
      await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');
      expect(stateOf('written')).toBe('past shown');
      expect(stateOf('default')).toBe('past shown');
      await user.keyboard('{ArrowRight}');
      expect(stateOf('written')).toBe('distantPast shown');
      expect(stateOf('default')).toBe('distantPast shown');
    });

    it('keeps the behavior of elements of a group with="parent"', async () => {
      const user = userEvent.setup();
      render(
        <Deck>
          <Slide>
            <Step>
              A
              <Step group="g" with="parent">
                B
              </Step>
              <Step group="g">C</Step>
              <Step group="g" only>
                D
              </Step>
            </Step>
            <Step>E</Step>
          </Slide>
        </Deck>,
      );
      await user.keyboard('{ArrowRight}');
      expect(stateOf('C')).toBe('current shown');
      expect(stateOf('D')).toBe('current shown');
      await user.keyboard('{ArrowRight}');
      expect(stateOf('C')).toBe('past shown');
      expect(stateOf('D')).toBe('past hidden');
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

  describe('of groups', () => {
    it('comes from the element creating the group', async () => {
      const user = userEvent.setup();
      render(
        <Deck>
          <Slide steps="dim">
            <Step group="g">A</Step>
            <Step group="g" only>
              B
            </Step>
            <Step group="h" only>
              C
            </Step>
            <Step group="h">D</Step>
            <Step>E</Step>
          </Slide>
        </Deck>,
      );
      await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');
      expect(appearanceOf(screen.getByText('A'))).toBe('dimmed');
      expect(appearanceOf(screen.getByText('B'))).toBe('hidden');
      expect(appearanceOf(screen.getByText('C'))).toBe('hidden');
      expect(appearanceOf(screen.getByText('D'))).toBe('hidden');
    });

    it('lets a default behavior apply to the element alone', async () => {
      const user = userEvent.setup();
      render(
        <Deck>
          <Slide>
            <Step>
              A<Step group="g">B</Step>
              <Step group="g" defaults={{ behavior: 'scoped' }}>
                C
              </Step>
            </Step>
            <Step>D</Step>
          </Slide>
        </Deck>,
      );
      await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');
      expect(appearanceOf(screen.getByText('B'))).toBe('shown');
      expect(appearanceOf(screen.getByText('C'))).toBe('hidden');
    });

    it('does not show elements up front like the steps creating it', () => {
      render(
        <Deck>
          <Slide>
            <Steps count={1} group="g">
              A
            </Steps>
            <Step group="g">B</Step>
          </Slide>
        </Deck>,
      );
      expect(appearanceOf(screen.getByText('B'))).toBe('hidden');
    });
  });

  describe('of steps without one of their own', () => {
    it('joins the step it is placed with', async () => {
      const user = userEvent.setup();
      render(
        <Deck>
          <Slide>
            <Step swap>A</Step>
            <Step with="previous">Joined</Step>
            <Step reveal with="previous">
              Own
            </Step>
            <Step>B</Step>
          </Slide>
        </Deck>,
      );
      await user.keyboard('{ArrowRight}{ArrowRight}');
      expect(appearanceOf(screen.getByText('Joined'))).toBe('collapsed');
      expect(appearanceOf(screen.getByText('Own'))).toBe('shown');
    });

    it('takes initial as a shorthand of with="initial"', async () => {
      const user = userEvent.setup();
      render(
        <Deck>
          <Slide>
            <Step swap initial>
              One
            </Step>
            <Step step initial>
              Two
            </Step>
            <Step>A</Step>
            <Step initial={false}>B</Step>
          </Slide>
        </Deck>,
      );
      expect(appearanceOf(screen.getByText('One'))).toBe('shown');
      expect(appearanceOf(screen.getByText('Two'))).toBe('shown');
      expect(appearanceOf(screen.getByText('A'))).toBe('hidden');
      await user.keyboard('{ArrowRight}');
      expect(window.location.hash).toBe('#slide=1&step=1');
      expect(appearanceOf(screen.getByText('One'))).toBe('collapsed');
      expect(appearanceOf(screen.getByText('B'))).toBe('hidden');
    });

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

    it('takes the default of the slide if what it joins has no appearances', async () => {
      const user = userEvent.setup();
      render(
        <Deck>
          <Slide steps="dim">
            <Steps count={2}>Figure</Steps>
            <Paragraph>After</Paragraph>
            <Step>End</Step>
          </Slide>
        </Deck>,
      );
      await user.keyboard('{ArrowRight}');
      expect(appearanceOf(screen.getByText('After'))).toBe('hidden');
      await user.keyboard('{ArrowRight}');
      expect(appearanceOf(screen.getByText('After'))).toBe('shown');
      await user.keyboard('{ArrowRight}');
      expect(appearanceOf(screen.getByText('After'))).toBe('dimmed');
      expect(appearanceOf(screen.getByText('Figure'))).toBe('shown');
    });

    it('stays in the step it joins with what it configures', async () => {
      const user = userEvent.setup();
      render(
        <Deck>
          <Slide>
            <Step>A</Step>
            <Paragraph split="none">B</Paragraph>
            <Paragraph overlay>C</Paragraph>
            <Paragraph fade={400}>D</Paragraph>
            <Paragraph>E</Paragraph>
          </Slide>
        </Deck>,
      );
      await user.keyboard('{ArrowRight}');
      expect(window.location.hash).toBe('#slide=1&step=1');
      for (const text of ['A', 'B', 'C', 'D', 'E']) {
        expect(appearanceOf(screen.getByText(text))).toBe('shown');
      }
      await user.keyboard('{ArrowRight}');
      expect(window.location.hash).toBe('#slide=1&step=1');
    });

    it('joins an earlier initial step', async () => {
      const user = userEvent.setup();
      render(
        <Deck>
          <Slide>
            <Step swap with="initial">
              One
            </Step>
            <Step>A</Step>
            <Step with="initial">Two</Step>
          </Slide>
        </Deck>,
      );
      expect(appearanceOf(screen.getByText('Two'))).toBe('shown');
      await user.keyboard('{ArrowRight}');
      expect(appearanceOf(screen.getByText('Two'))).toBe('collapsed');
    });

    it('creates step 0 if there is no initial step to join', async () => {
      const user = userEvent.setup();
      render(
        <Deck>
          <Slide steps="dim">
            <Step with="previous">
              First
              <Step scoped>Inside</Step>
            </Step>
            <Step>Next</Step>
          </Slide>
        </Deck>,
      );
      await user.keyboard('{ArrowRight}');
      expect(window.location.hash).toBe('#slide=1&step=0.1');
      expect(appearanceOf(screen.getByText('Inside'))).toBe('shown');
      expect(appearanceOf(screen.getByText('First'))).toBe('shown');
      await user.keyboard('{ArrowRight}');
      expect(appearanceOf(screen.getByText('Inside'))).toBe('hidden');
      expect(appearanceOf(screen.getByText('First'))).toBe('dimmed');
    });

    it('takes the default of the slide if it creates step 0', async () => {
      const user = userEvent.setup();
      render(
        <Deck>
          <Slide steps="dim">
            <Paragraph with="content">Written</Paragraph>
            <Paragraph>Plain</Paragraph>
            <Step>Next</Step>
          </Slide>
        </Deck>,
      );
      await user.keyboard('{ArrowRight}');
      expect(appearanceOf(screen.getByText('Written'))).toBe('dimmed');
      expect(appearanceOf(screen.getByText('Plain'))).toBe('dimmed');
    });

    it('is open while steps nested in step 0 of it are shown', async () => {
      const user = userEvent.setup();
      render(
        <Deck>
          <Slide>
            <Step>
              Outer
              <Step with="initial">
                Inner<Step>Nested</Step>
              </Step>
              <Step>Later</Step>
            </Step>
          </Slide>
        </Deck>,
      );
      await user.keyboard('{ArrowRight}{ArrowRight}');
      expect(window.location.hash).toBe('#slide=1&step=1.0.1');
      expect(stateOf('Outer')).toBe('open shown');
      expect(stateOf('Inner')).toBe('open shown');
      await user.keyboard('{ArrowRight}');
      expect(stateOf('Outer')).toBe('open shown');
      expect(stateOf('Inner')).toBe('past shown');
    });
  });

  it('tells the phases apart', async () => {
    const user = userEvent.setup();
    renderSlide();
    // Distant while the step it is nested in is still to come.
    expect([stateOf('A'), stateOf('B'), stateOf('C')]).toEqual([
      'future hidden',
      'distantFuture hidden',
      'future hidden',
    ]);
    await user.keyboard('{ArrowRight}');
    expect([stateOf('A'), stateOf('B')]).toEqual([
      'current shown',
      'future hidden',
    ]);
    await user.keyboard('{ArrowRight}');
    expect([stateOf('A'), stateOf('B')]).toEqual([
      'open shown',
      'current shown',
    ]);
    await user.keyboard('{ArrowRight}');
    expect([stateOf('A'), stateOf('B'), stateOf('C')]).toEqual([
      'past shown',
      'distantPast shown',
      'current shown',
    ]);
  });

  it.each([
    ['dim', 'hidden', 'dimmed'],
    ['preview', 'dimmed', 'shown'],
    ['focus', 'dimmed', 'dimmed'],
    ['only', 'hidden', 'hidden'],
    ['insert', 'collapsed', 'shown'],
    ['swap', 'collapsed', 'collapsed'],
  ] as const)('styles %s steps', async (behavior, future, past) => {
    const user = userEvent.setup();
    renderSlide(behavior);
    expect(stateOf('C')).toBe(`future ${future}`);
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');
    expect(stateOf('A')).toBe(`past ${past}`);
    expect(stateOf('C')).toBe('current shown');
  });

  it('swaps steps in the same place', async () => {
    const user = userEvent.setup();
    render(
      <Deck>
        <Slide title="Swaps">
          <Step with="initial" behavior="swap">
            A
          </Step>
          <Step behavior="swap">B</Step>
          <Step behavior="swap">C</Step>
        </Slide>
      </Deck>,
    );
    const states = () => ['A', 'B', 'C'].map((text) => stateOf(text));
    expect(states()).toEqual([
      'current shown',
      'future collapsed',
      'future collapsed',
    ]);
    await user.keyboard('{ArrowRight}');
    expect(states()).toEqual([
      'past collapsed',
      'current shown',
      'future collapsed',
    ]);
    await user.keyboard('{ArrowRight}');
    expect(states()).toEqual([
      'past collapsed',
      'past collapsed',
      'current shown',
    ]);
  });

  it('takes the behavior from the slide', async () => {
    const user = userEvent.setup();
    renderSlide(undefined, 'dim');
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');
    expect(stateOf('A')).toBe('past dimmed');
  });

  it('prefers the slide to the default of the theme', async () => {
    const user = userEvent.setup();
    const theme = createSlideTheme({
      components: { SeminarStep: { defaultProps: { behavior: 'only' } } },
    });
    render(
      <ThemeProvider theme={theme}>
        <Deck theme={theme}>
          <Slide title="Steps" steps="dim">
            <Step>A</Step>
            <Step behavior="reveal">B</Step>
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
        'open shown',
        'current shown',
        'future hidden',
        'future hidden',
      ]);
      await user.keyboard('{ArrowRight}{ArrowRight}');
      // Distant once the step they are nested in is past.
      expect(states()).toEqual([
        'past shown',
        'distantPast shown',
        'distantPast shown',
        'current shown',
      ]);
    });

    it('tells the distant phases apart', async () => {
      const user = userEvent.setup();
      const theme = createSlideTheme({
        stepBehaviors: {
          callout: { future: 'hidden', distantPast: 'hidden' },
        } as Record<string, StepAppearances>,
      });
      render(
        <Deck theme={theme}>
          <Slide title="Callouts">
            <Step group="a" behavior="dim">
              A
            </Step>
            <Step group="b">B</Step>
            <Step in="a" behavior={'callout' as StepBehavior}>
              X
            </Step>
          </Slide>
        </Deck>,
      );
      expect(stateOf('X')).toBe('distantFuture hidden');
      await user.keyboard('{ArrowRight}{ArrowRight}');
      expect([stateOf('A'), stateOf('X')]).toEqual([
        'open shown',
        'current shown',
      ]);
      // Hidden once A is past, although A is only dimmed.
      await user.keyboard('{ArrowRight}');
      expect([stateOf('A'), stateOf('X')]).toEqual([
        'past dimmed',
        'distantPast hidden',
      ]);
    });

    it('hides scoped steps once the step they are nested in is past', async () => {
      const user = userEvent.setup();
      renderCallouts('reveal', 'scoped');
      const states = () => ['X', 'Y'].map(stateOf);
      expect(states()).toEqual([
        'distantFuture hidden',
        'distantFuture hidden',
      ]);
      await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');
      expect(states()).toEqual(['past shown', 'current shown']);
      await user.keyboard('{ArrowRight}');
      expect(states()).toEqual(['distantPast hidden', 'distantPast hidden']);
    });

    it('looks at least as hidden as the step it is nested in', async () => {
      const user = userEvent.setup();
      renderCallouts('only', 'focus');
      // Hidden with the future parent, although focus would only dim it.
      expect(stateOf('X')).toBe('distantFuture hidden');
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
        'distantPast hidden',
        'distantPast hidden',
      ]);
    });

    it('collapses expanded steps once the step they are nested in is past', async () => {
      const user = userEvent.setup();
      renderCallouts('reveal', 'expand');
      const states = () => ['X', 'Y'].map(stateOf);
      expect(states()).toEqual([
        'distantFuture collapsed',
        'distantFuture collapsed',
      ]);
      await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');
      expect(states()).toEqual(['past shown', 'current shown']);
      await user.keyboard('{ArrowRight}');
      expect(states()).toEqual([
        'distantPast collapsed',
        'distantPast collapsed',
      ]);
    });

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

    it('keeps hiding nested steps after their turn', async () => {
      const user = userEvent.setup();
      renderCallouts('reveal', 'only');
      await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}');
      expect([stateOf('A'), stateOf('X')]).toEqual([
        'past shown',
        'distantPast hidden',
      ]);
    });

    it('combines the DOM and in', async () => {
      const user = userEvent.setup();
      render(
        <Deck>
          <Slide title="Both">
            <Step group="a" behavior="only">
              A
            </Step>
            <Step behavior="preview" data-testid="b">
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
      ]).toEqual(['past hidden', 'shown', 'distantPast hidden']);
    });
  });

  it('falls back to more general phases', () => {
    const ranked = rankAppearances(createSlideTheme(), {
      future: 'dimmed',
      current: 'hidden',
      distantPast: 'hidden',
    });
    expect(
      Object.fromEntries(
        Object.entries(ranked).map(([phase, { name }]) => [phase, name]),
      ),
    ).toEqual({
      distantFuture: 'dimmed',
      future: 'dimmed',
      current: 'hidden',
      open: 'hidden',
      past: 'shown',
      distantPast: 'hidden',
    });
  });

  it('takes the appearances of behaviors from the theme', async () => {
    const user = userEvent.setup();
    const theme = createSlideTheme({
      stepBehaviors: {
        dim: { future: 'dimmed', past: 'hidden' },
      },
    });
    render(
      <Deck theme={theme}>
        <Slide title="Steps">
          <Step group="a" behavior="dim">
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
      'distantPast hidden',
    ]);
  });

  it('ranks appearances added by the theme', async () => {
    const user = userEvent.setup();
    const theme = createSlideTheme({
      stepAppearances: { faded: 50 } as Record<string, number>,
      stepBehaviors: {
        dim: { future: 'hidden', past: 'faded' as 'dimmed' },
      },
    });
    render(
      <Deck theme={theme}>
        <Slide title="Steps">
          <Step group="a" behavior="dim">
            A
          </Step>
          <Step>B</Step>
          <Step in="a">X</Step>
          <Step in="a" behavior="focus">
            Y
          </Step>
        </Slide>
      </Deck>,
    );
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}');
    const classesOf = (text: string) => screen.getByText(text).className;
    // Faded with A, since reveal would show it.
    expect(classesOf('A')).toContain('SeminarStep-faded');
    expect(classesOf('X')).toContain('SeminarStep-faded');
    // Dimmed is more hidden than faded.
    expect(classesOf('Y')).toContain('SeminarStep-dimmed');
    expect(classesOf('Y')).not.toContain('SeminarStep-faded');
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

  it('lets wrappers set a default while keeping custom shorthands', async () => {
    const user = userEvent.setup();
    const theme = createSlideTheme({
      stepBehaviors: {
        ghost: { future: 'dimmed', past: 'hidden' },
      } as Record<string, StepAppearances>,
    });
    const ghost = { ghost: '' } as Record<string, string>;
    render(
      <Deck theme={theme}>
        <Slide title="Steps" steps="preview">
          <Step defaults={{ behavior: 'only' }}>A</Step>
          <Step defaults={{ behavior: 'only' }} {...ghost}>
            B
          </Step>
          <Step defaults={{ behavior: 'only' }} behavior="dim">
            C
          </Step>
        </Slide>
      </Deck>,
    );
    expect([stateOf('A'), stateOf('B'), stateOf('C')]).toEqual([
      'future hidden',
      'future dimmed',
      'future hidden',
    ]);
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');
    expect([stateOf('A'), stateOf('B')]).toEqual([
      'past hidden',
      'past hidden',
    ]);
  });
});
