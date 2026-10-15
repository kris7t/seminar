import { act, cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Deck } from '../deck/Deck.tsx';
import { Slide } from '../slide/Slide.tsx';
import { Step, stepClasses } from './Step.tsx';
import { Together } from './Together.tsx';
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
      `.${stepClasses.root}:not(.${stepClasses.future})`,
    ),
  ].map(
    (element) =>
      (element.classList.contains(stepClasses.current) ||
      element.classList.contains(stepClasses.parent)
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

  it('shows steps together with the previous one', async () => {
    const user = userEvent.setup();
    render(
      <Deck>
        <Slide>
          <ul>
            <Step component="li" data-name="a">
              a
            </Step>
            <Step component="li" data-name="b" with="previous">
              b
            </Step>
            <Step component="li" data-name="c">
              c
            </Step>
          </ul>
        </Slide>
      </Deck>,
    );
    await user.keyboard('{ArrowRight}');
    expect(shownItems()).toEqual(['*a', '*b']);
    await user.keyboard('{ArrowRight}');
    expect(shownItems()).toEqual(['a', 'b', '*c']);
  });

  it('shows the steps of a group together', async () => {
    const user = userEvent.setup();
    render(
      <Deck>
        <Slide>
          <ul>
            <Step component="li" data-name="a">
              a
            </Step>
            <Together>
              <Step component="li" data-name="b">
                b
              </Step>
              <Step component="li" data-name="c">
                c
                <ul>
                  <Step component="li" data-name="c.1">
                    c.1
                  </Step>
                </ul>
              </Step>
            </Together>
          </ul>
        </Slide>
      </Deck>,
    );
    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(shownItems()).toEqual(['a', '*b', '*c']);
    expect(window.location.hash).toBe('#slide=1&step=2');
    await user.keyboard('{ArrowRight}');
    expect(shownItems()).toEqual(['a', '*b', '*c', '*c.1']);
    expect(window.location.hash).toBe('#slide=1&step=2.1');
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
            <Together with={second}>
              <Step component="li" data-name="b2">
                b2
              </Step>
              <Step component="li" data-name="b3">
                b3
              </Step>
            </Together>
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
    it('shares steps between the elements of a group', async () => {
      const user = userEvent.setup();
      render(
        <Deck>
          <Slide>
            <ul>
              <Step component="li" data-name="a1" group="a" />
              <Step component="li" data-name="b1" group="b" />
              <Step component="li" data-name="a2" group="a" />
              <Step component="li" data-name="b2" group="b" />
            </ul>
          </Slide>
        </Deck>,
      );
      expect(shownItems()).toEqual([]);
      await user.keyboard('{ArrowRight}');
      expect(shownItems()).toEqual(['*a1', '*a2']);
      await user.keyboard('{ArrowRight}');
      expect(shownItems()).toEqual(['a1', '*b1', 'a2', '*b2']);
      expect(window.location.hash).toBe('#slide=1&step=2');
    });

    it('places nested elements of a group at the outer level', async () => {
      const user = userEvent.setup();
      render(
        <Deck>
          <Slide>
            <ul>
              <Item name="x">
                <ul>
                  <Step component="li" data-name="a1" group="a">
                    <ul>
                      <Item name="a1.1" />
                    </ul>
                  </Step>
                </ul>
              </Item>
              <Step component="li" data-name="a2" group="a" />
            </ul>
          </Slide>
        </Deck>,
      );
      await user.keyboard('{ArrowRight}');
      expect(shownItems()).toEqual(['*x']);
      await user.keyboard('{ArrowRight}');
      expect(shownItems()).toEqual(['x', '*a1', '*a2']);
      expect(window.location.hash).toBe('#slide=1&step=2');
      await user.keyboard('{ArrowRight}');
      expect(shownItems()).toEqual(['x', '*a1', '*a1.1', '*a2']);
      expect(window.location.hash).toBe('#slide=1&step=2.1');
    });

    it('places the group by its first element', async () => {
      const user = userEvent.setup();
      render(
        <Deck>
          <Slide>
            <ul>
              <Item name="x" />
              <Step component="li" data-name="a1" group="a" with="previous" />
              <Step component="li" data-name="a2" group="a" with="initial" />
            </ul>
          </Slide>
        </Deck>,
      );
      expect(shownItems()).toEqual([]);
      await user.keyboard('{ArrowRight}');
      expect(shownItems()).toEqual(['*x', '*a1', '*a2']);
    });
  });

  describe('with="initial"', () => {
    it('shows steps up front', async () => {
      const user = userEvent.setup();
      render(
        <Deck>
          <Slide>
            <ul>
              <Item name="a" with="initial" />
              <Item name="b" with="previous" />
              <Item name="c" />
            </ul>
          </Slide>
        </Deck>,
      );
      expect(shownItems()).toEqual(['*a', '*b']);
      await user.keyboard('{ArrowRight}');
      expect(shownItems()).toEqual(['a', 'b', '*c']);
      expect(window.location.hash).toBe('#slide=1&step=1');
      await user.keyboard('{ArrowLeft}');
      expect(shownItems()).toEqual(['*a', '*b']);
      expect(window.location.hash).toBe('#slide=1');
    });

    it('is the same as with="previous" without previous steps', async () => {
      const user = userEvent.setup();
      render(
        <Deck>
          <Slide>
            <ul>
              <Item name="a" with="previous" />
              <Item name="b" with="previous" />
              <Item name="c" />
              <Item name="d" with="previous">
                <ul>
                  <Item name="d.a" with="previous" />
                  <Item name="d.b" />
                </ul>
              </Item>
            </ul>
          </Slide>
        </Deck>,
      );
      expect(shownItems()).toEqual(['*a', '*b']);
      await user.keyboard('{ArrowRight}');
      expect(shownItems()).toEqual(['a', 'b', '*c', '*d', '*d.a']);
      await user.keyboard('{ArrowRight}');
      expect(shownItems()).toEqual(['a', 'b', '*c', '*d', 'd.a', '*d.b']);
    });

    it('steps through steps nested in steps shown up front', async () => {
      const user = userEvent.setup();
      render(
        <Deck>
          <Slide>
            <ul>
              <Item name="a" with="initial">
                <ul>
                  <Item name="a.1" />
                  <Item name="a.2" />
                </ul>
              </Item>
              <Item name="b" />
            </ul>
          </Slide>
        </Deck>,
      );
      expect(shownItems()).toEqual(['*a']);
      const forward: [string, string[]][] = [
        ['0.1', ['*a', '*a.1']],
        ['0.2', ['*a', 'a.1', '*a.2']],
        ['1', ['a', 'a.1', 'a.2', '*b']],
      ];
      for (const [step, items] of forward) {
        await user.keyboard('{ArrowRight}');
        expect(window.location.hash).toBe(`#slide=1&step=${step}`);
        expect(shownItems()).toEqual(items);
      }
      for (const step of ['0.2', '0.1']) {
        await user.keyboard('{ArrowLeft}');
        expect(window.location.hash).toBe(`#slide=1&step=${step}`);
      }
      await user.keyboard('{ArrowLeft}');
      expect(window.location.hash).toBe('#slide=1');
      expect(shownItems()).toEqual(['*a']);
    });

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

    it('waits for the enclosing step', async () => {
      const user = userEvent.setup();
      render(
        <Deck>
          <Slide>
            <ul>
              <Item name="1">
                <ul>
                  <Item name="1.a" with="initial" />
                  <Item name="1.b" />
                </ul>
              </Item>
            </ul>
          </Slide>
        </Deck>,
      );
      expect(shownItems()).toEqual([]);
      await user.keyboard('{ArrowRight}');
      expect(shownItems()).toEqual(['*1', '*1.a']);
      await user.keyboard('{ArrowRight}');
      expect(shownItems()).toEqual(['*1', '1.a', '*1.b']);
      expect(window.location.hash).toBe('#slide=1&step=1.1');
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

  it('returns the handle passed as with from the hooks', () => {
    const handles: unknown[] = [];
    function Linked() {
      const step = useSteps(2);
      const linked = useStep({ with: step });
      handles.push(step, linked);
      return <Steps with={step}>{() => 'linked'}</Steps>;
    }
    render(
      <Deck>
        <Slide>
          <Linked />
        </Slide>
      </Deck>,
    );
    expect(handles.at(-1)).toBe(handles.at(-2));
  });
});
