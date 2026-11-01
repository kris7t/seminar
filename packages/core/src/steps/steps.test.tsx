import { act, cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Deck } from '../deck/Deck.tsx';
import { Slide } from '../slide/Slide.tsx';
import { Step, stepClasses, type StepProps } from './Step.tsx';
import { Steps } from './Steps.tsx';
import { useStep, useSteps, type StepWith } from './useSteps.ts';

function navigateTo(hash: string) {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

/** Returns the visible items, marking the current one with `*`. */
function shownItems(): string[] {
  return [
    ...document.querySelectorAll(
      `.${stepClasses.root}:not(.${stepClasses.future}, .${stepClasses.distantFuture})`,
    ),
  ].map(
    (element) =>
      (element.classList.contains(stepClasses.current) ||
      element.classList.contains(stepClasses.open)
        ? '*'
        : '') + (element.getAttribute('data-name') ?? ''),
  );
}

function Item({
  name,
  with: withStep,
  children,
}: {
  name: string;
  with?: StepWith;
  children?: ReactNode;
}) {
  return (
    <Step component="li" data-name={name} with={withStep}>
      {name}
      {children}
    </Step>
  );
}

function renderNested() {
  return render(
    <Deck>
      <Slide title="Steps">
        <ul>
          <Item name="1" />
          <Item name="2">
            <ul>
              <Item name="2.1" />
              <Item name="2.2" />
            </ul>
          </Item>
          <Item name="3" />
        </ul>
      </Slide>
      <Slide title="Next" />
    </Deck>,
  );
}

describe('steps', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '#');
  });

  afterEach(() => {
    cleanup();
  });

  it('advances through nested steps', async () => {
    const user = userEvent.setup();
    renderNested();
    expect(shownItems()).toEqual([]);
    expect(window.location.hash).toBe('#slide=1');
    const expected: [string, string[]][] = [
      ['1', ['*1']],
      ['2', ['1', '*2']],
      ['2.1', ['1', '*2', '*2.1']],
      ['2.2', ['1', '*2', '2.1', '*2.2']],
      ['3', ['1', '2', '2.1', '2.2', '*3']],
    ];
    for (const [step, items] of expected) {
      await user.keyboard('{ArrowRight}');
      expect(window.location.hash).toBe(`#slide=1&step=${step}`);
      expect(shownItems()).toEqual(items);
    }
    await user.keyboard('{ArrowRight}');
    expect(window.location.hash).toBe('#slide=2');
  });

  it('goes back through nested steps', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '#slide=2');
    renderNested();
    const expected = ['3', '2.2', '2.1', '2', '1'];
    for (const step of expected) {
      await user.keyboard('{ArrowLeft}');
      expect(window.location.hash).toBe(`#slide=1&step=${step}`);
    }
    await user.keyboard('{ArrowLeft}');
    expect(window.location.hash).toBe('#slide=1');
    expect(shownItems()).toEqual([]);
    await user.keyboard('{ArrowLeft}');
    expect(window.location.hash).toBe('#slide=1');
  });

  it('skips steps when moving between slides directly', async () => {
    const user = userEvent.setup();
    renderNested();
    await user.keyboard('{ArrowRight}{End}');
    expect(window.location.hash).toBe('#slide=2');
    await user.keyboard('{Home}');
    expect(window.location.hash).toBe('#slide=1');
    expect(shownItems()).toEqual([]);
  });

  it('skips steps with Page Up and Page Down', async () => {
    const user = userEvent.setup();
    renderNested();
    await user.keyboard('{ArrowRight}{PageDown}');
    expect(window.location.hash).toBe('#slide=2');
    // Returns to the steps last shown on the slide.
    await user.keyboard('{PageUp}');
    expect(window.location.hash).toBe('#slide=1&step=1');
    expect(shownItems()).toEqual(['*1']);
    // Other navigation starts the slide from the beginning.
    await user.keyboard('{PageDown}{Home}');
    expect(window.location.hash).toBe('#slide=1');
    expect(shownItems()).toEqual([]);
  });

  it('goes to the first and last step of the slide', async () => {
    const user = userEvent.setup();
    renderNested();
    await user.keyboard('{Shift>}{End}{/Shift}');
    expect(window.location.hash).toBe('#slide=1&step=3');
    expect(shownItems()).toEqual(['1', '2', '2.1', '2.2', '*3']);
    await user.keyboard('{ArrowLeft}');
    expect(window.location.hash).toBe('#slide=1&step=2.2');
    await user.keyboard('{Shift>}{Home}{/Shift}');
    expect(window.location.hash).toBe('#slide=1');
    expect(shownItems()).toEqual([]);
  });

  it('restores the step from the location hash', () => {
    window.history.replaceState(null, '', '#slide=1&step=2.1');
    renderNested();
    expect(shownItems()).toEqual(['1', '*2', '*2.1']);
  });

  it('drops invalid steps from the location hash', () => {
    window.history.replaceState(null, '', '#slide=1&step=2.5.1');
    renderNested();
    expect(shownItems()).toEqual(['1', '*2']);
    expect(window.location.hash).toBe('#slide=1&step=2');
  });

  it('follows links to steps', () => {
    renderNested();
    navigateTo('#slide=1&step=3');
    expect(shownItems()).toEqual(['1', '2', '2.1', '2.2', '*3']);
    navigateTo('#slide=1&step=9');
    expect(shownItems()).toEqual([]);
    expect(window.location.hash).toBe('#slide=1');
  });

  it('numbers steps consecutively across steppers', () => {
    window.history.replaceState(null, '', '#slide=1&step=4');
    render(
      <Deck>
        <Slide>
          <Steps count={3}>
            {({ stepIndex, isCurrent }) =>
              `first: ${String(stepIndex)} ${String(isCurrent)}`
            }
          </Steps>
          <Steps count={2}>
            {({ stepIndex, isCurrent }) =>
              `second: ${String(stepIndex)} ${String(isCurrent)}`
            }
          </Steps>
        </Slide>
      </Deck>,
    );
    expect(screen.getByText(/^first:/).textContent).toBe('first: 2 false');
    expect(screen.getByText(/^second:/).textContent).toBe('second: 0 true');
  });

  describe('placing a stepper with another step', () => {
    function Placed() {
      const { ref, phase, appearance } = useStep({ with: 'previous' });
      return (
        <div ref={ref} data-testid="placed">
          {phase} {appearance.name}
        </div>
      );
    }

    it('joins the step if there is one', async () => {
      const user = userEvent.setup();
      render(
        <Deck>
          <Slide>
            <Step only />
            <Placed />
            <Step />
          </Slide>
        </Deck>,
      );
      await user.keyboard('{ArrowRight}{ArrowRight}');
      expect(window.location.hash).toBe('#slide=1&step=2');
      expect(screen.getByTestId('placed').textContent).toBe('past hidden');
    });

    it('creates a step 0 if there is none', async () => {
      const user = userEvent.setup();
      render(
        <Deck>
          <Slide>
            <Placed />
            <Step />
          </Slide>
        </Deck>,
      );
      expect(screen.getByTestId('placed').textContent).toBe('current shown');
      await user.keyboard('{ArrowRight}');
      // Without a step, it would stay current along with the slide.
      expect(screen.getByTestId('placed').textContent).toBe('past shown');
    });
  });

  it('goes to steps relative to a group at step 0', () => {
    window.history.replaceState(null, '', '#slide=1&step=a.1');
    render(
      <Deck>
        <Slide>
          <Step group="a" initial data-name="a">
            a<Step data-name="nested">nested</Step>
          </Step>
          <Step data-name="b">b</Step>
        </Slide>
      </Deck>,
    );
    expect(shownItems()).toEqual(['*a', '*nested']);
  });

  it('uses its own class for the open phase', () => {
    window.history.replaceState(null, '', '#slide=1&step=1.1');
    render(
      <Deck>
        <Slide>
          <Step data-name="a">
            a<Step>b</Step>
          </Step>
        </Slide>
      </Deck>,
    );
    expect(stepClasses.open).toBe('SeminarStep-open');
    expect(screen.getByText('a').classList).toContain('SeminarStep-open');
  });

  it('handles steps rendered only when the enclosing step is active', async () => {
    const user = userEvent.setup();
    function Lazy() {
      const { ref, isActive } = useStep();
      return (
        <li ref={ref}>
          lazy
          {isActive && (
            <ul>
              <Item name="lazy.1" />
              <Item name="lazy.2" />
            </ul>
          )}
        </li>
      );
    }
    window.history.replaceState(null, '', '#slide=2');
    render(
      <Deck>
        <Slide>
          <ul>
            <Lazy />
          </ul>
        </Slide>
        <Slide />
      </Deck>,
    );
    await user.keyboard('{ArrowLeft}');
    expect(window.location.hash).toBe('#slide=1&step=1.2');
    expect(shownItems()).toEqual(['lazy.1', '*lazy.2']);
    await user.keyboard('{Shift>}{Home}{/Shift}');
    expect(screen.queryByText('lazy.1')).toBeNull();
    await user.keyboard('{Shift>}{End}{/Shift}');
    expect(window.location.hash).toBe('#slide=1&step=1.2');
    expect(shownItems()).toEqual(['lazy.1', '*lazy.2']);
    navigateTo('#slide=1&step=1.1');
    expect(shownItems()).toEqual(['*lazy.1']);
    navigateTo('#slide=1');
    expect(screen.queryByText('lazy.1')).toBeNull();
  });

  it('shows the last step outside of a deck', () => {
    render(
      <ul>
        <Item name="a" />
        <Item name="b" />
      </ul>,
    );
    expect(shownItems()).toEqual(['a', '*b']);
  });

  it('links steps passed as with', async () => {
    const user = userEvent.setup();
    function ParallelLists() {
      const first = useStep();
      const second = useStep();
      return (
        <>
          <ol>
            <Step component="li" data-name="a1" with={first}>
              a1
            </Step>
            <Step component="li" data-name="a2" with={second}>
              a2
            </Step>
          </ol>
          <ol>
            <Step component="li" data-name="b1" with={first}>
              b1
            </Step>
            <Step component="li" data-name="b2" with={second}>
              b2
            </Step>
            <Step component="li" data-name="b3" with={second}>
              b3
            </Step>
          </ol>
          <Step data-name="last">last</Step>
        </>
      );
    }
    render(
      <Deck>
        <Slide>
          <ParallelLists />
        </Slide>
      </Deck>,
    );
    await user.keyboard('{ArrowRight}');
    expect(shownItems()).toEqual(['*a1', '*b1']);
    await user.keyboard('{ArrowRight}');
    expect(shownItems()).toEqual(['a1', '*a2', 'b1', '*b2', '*b3']);
    await user.keyboard('{ArrowRight}');
    expect(shownItems()).toEqual(['a1', 'a2', 'b1', 'b2', 'b3', '*last']);
  });

  it('links counted steps passed as with', async () => {
    const user = userEvent.setup();
    function ParallelFigures() {
      const highlight = useSteps(2);
      return (
        <>
          <Steps with={highlight}>
            {({ stepIndex }) => `left: ${String(stepIndex)}`}
          </Steps>
          <Steps with={highlight}>
            {({ stepIndex }) => `right: ${String(stepIndex)}`}
          </Steps>
        </>
      );
    }
    render(
      <Deck>
        <Slide>
          <ParallelFigures />
        </Slide>
      </Deck>,
    );
    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(screen.getByText(/^left:/).textContent).toBe('left: 1');
    expect(screen.getByText(/^right:/).textContent).toBe('right: 1');
    expect(window.location.hash).toBe('#slide=1&step=2');
  });

  describe('groups', () => {
    it('goes to the steps of groups by their names', () => {
      window.history.replaceState(null, '', '#intro&step=b.1');
      render(
        <Deck>
          <Slide id="intro">
            <ul>
              <Step component="li" data-name="a" group="a" />
              <Step component="li" data-name="b" group="b">
                <ul>
                  <Item name="b.1" />
                </ul>
              </Step>
              <Item name="c" />
            </ul>
          </Slide>
        </Deck>,
      );
      expect(shownItems()).toEqual(['a', '*b', '*b.1']);
      expect(window.location.hash).toBe('#intro&step=b.1');
      navigateTo('#intro&step=c');
      // Unknown groups go to the beginning of the slide.
      expect(shownItems()).toEqual([]);
      expect(window.location.hash).toBe('#intro');
      navigateTo('#intro&step=3');
      expect(window.location.hash).toBe('#intro&step=3');
      navigateTo('#intro&step=a');
      expect(shownItems()).toEqual(['*a']);
    });
  });

  describe('with="initial"', () => {
    it('restores steps nested in steps shown up front', () => {
      window.history.replaceState(null, '', '#slide=1&step=0.1');
      render(
        <Deck>
          <Slide>
            <ul>
              <Item name="a" with="initial">
                <ul>
                  <Item name="a.1" />
                </ul>
              </Item>
            </ul>
          </Slide>
        </Deck>,
      );
      expect(shownItems()).toEqual(['*a', '*a.1']);
    });

    it('can be passed as with', async () => {
      const user = userEvent.setup();
      function Lists() {
        const intro = useStep({ with: 'initial' });
        return (
          <>
            <ul>
              <Item name="a1" with={intro} />
              <Item name="a2" />
            </ul>
            <ul>
              <Item name="b1" with={intro} />
              <Item name="b2" with="previous" />
            </ul>
          </>
        );
      }
      render(
        <Deck>
          <Slide>
            <Lists />
          </Slide>
        </Deck>,
      );
      expect(shownItems()).toEqual(['*a1', '*b1']);
      await user.keyboard('{ArrowRight}');
      expect(shownItems()).toEqual(['a1', '*a2', 'b1', '*b2']);
    });
  });

  it('shares the state of the handle passed as with', async () => {
    const user = userEvent.setup();
    function Linked() {
      const { ref, stepIndex, ...step } = useSteps(2);
      const handle = { ref, stepIndex, ...step };
      const { ref: linkedRef, stepIndex: linkedIndex } = useStep({
        with: handle,
      });
      return (
        <>
          <div ref={ref} />
          <div ref={linkedRef} data-testid="linked">
            {stepIndex} {linkedIndex}
          </div>
        </>
      );
    }
    render(
      <Deck>
        <Slide>
          <Linked />
        </Slide>
      </Deck>,
    );
    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(screen.getByTestId('linked').textContent).toBe('1 1');
    expect(window.location.hash).toBe('#slide=1&step=2');
  });

  describe('passing the props of a step to the hooks', () => {
    function Wrapper(props: StepProps) {
      const { ref, phase, appearance } = useStep(props);
      return (
        <div ref={ref} data-testid="wrapper">
          {phase} {appearance.name}
        </div>
      );
    }

    it.each([
      ['a shorthand', { only: true }, 'past hidden'],
      ['a behavior', { behavior: 'focus' }, 'past dimmed'],
      ['no behavior', {}, 'past dimmed'],
      ['with="parent"', { with: 'parent' }, 'current shown'],
      ['step={false}', { step: false }, 'current shown'],
    ] as const)('takes %s like a step', async (_name, props, expected) => {
      const user = userEvent.setup();
      render(
        <Deck>
          <Slide steps="dim">
            <Wrapper {...props} />
            <Step />
            <Step />
          </Slide>
        </Deck>,
      );
      await user.keyboard('{ArrowRight}{ArrowRight}');
      expect(screen.getByTestId('wrapper').textContent).toBe(expected);
    });

    it('places a step like the same step', async () => {
      const user = userEvent.setup();
      render(
        <Deck>
          <Slide>
            <Step />
            <Wrapper initial />
          </Slide>
        </Deck>,
      );
      expect(screen.getByTestId('wrapper').textContent).toBe('current shown');
      await user.keyboard('{ArrowRight}');
      expect(screen.getByTestId('wrapper').textContent).toBe('past shown');
    });
  });
});
