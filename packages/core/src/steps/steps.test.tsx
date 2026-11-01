import { act, cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Deck } from '../deck/Deck.tsx';
import { Slide } from '../slide/Slide.tsx';
import { Step, stepClasses, type StepProps } from './Step.tsx';
import { ListItem } from '../content/ListItem.tsx';
import { Paragraph } from '../content/Paragraph.tsx';
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

  it('shows list items with the previous step unless they are steps', async () => {
    const user = userEvent.setup();
    render(
      <Deck>
        <Slide>
          <ul>
            <Step component="li" data-name="a">
              a
            </Step>
            <ListItem data-name="b">b</ListItem>
            <ListItem only data-name="c">
              c
            </ListItem>
            <ListItem step data-name="d">
              d
            </ListItem>
            <ListItem id="e" data-name="e">
              e
            </ListItem>
          </ul>
        </Slide>
      </Deck>,
    );
    await user.keyboard('{ArrowRight}');
    expect(shownItems()).toEqual(['*a', '*b']);
    // A behavior makes an item a step of its own.
    await user.keyboard('{ArrowRight}');
    expect(shownItems()).toEqual(['a', 'b', '*c']);
    // So does `step`, and an id alone doesn't. The `only` item is past.
    await user.keyboard('{ArrowRight}');
    expect(shownItems()).toEqual(['a', 'b', 'c', '*d', '*e']);
  });

  describe('content placement', () => {
    /** Goes through the slide, returning the shown elements in each state. */
    async function walk(ui: ReactNode, count: number) {
      const user = userEvent.setup();
      render(
        <Deck>
          <Slide>{ui}</Slide>
        </Deck>,
      );
      const states = [shownItems()];
      for (let index = 0; index < count; index += 1) {
        await user.keyboard('{ArrowRight}');
        states.push(shownItems());
      }
      return states;
    }

    it('follows the content before overlays', async () => {
      const states = await walk(
        <>
          <Paragraph step data-name="a">
            a
          </Paragraph>
          <Step overlay data-name="callout">
            callout
          </Step>
          <Paragraph data-name="b">b</Paragraph>
        </>,
        2,
      );
      expect(states).toEqual([[], ['*a', '*b'], ['a', '*callout', 'b']]);
    });

    it('is shown up front if only overlays are before it', async () => {
      const states = await walk(
        <>
          <Step overlay data-name="callout">
            callout
          </Step>
          <Paragraph data-name="a">a</Paragraph>
        </>,
        1,
      );
      expect(states).toEqual([['*a'], ['*callout', '*a']]);
    });

    it('follows overlays that are ordinary steps', async () => {
      const states = await walk(
        <>
          <Step overlay={false} data-name="callout">
            callout
          </Step>
          <Paragraph data-name="a">a</Paragraph>
        </>,
        1,
      );
      expect(states).toEqual([[], ['*callout', '*a']]);
    });

    it('follows steps shown up front', async () => {
      const states = await walk(
        <>
          <Paragraph step data-name="a">
            a
          </Paragraph>
          <Step with="initial" data-name="up front">
            up front
          </Step>
          <Paragraph data-name="b">b</Paragraph>
        </>,
        1,
      );
      expect(states).toEqual([
        ['*up front', '*b'],
        ['*a', 'up front', 'b'],
      ]);
    });

    it('creates step 0 if written and there is nothing to join', async () => {
      const user = userEvent.setup();
      render(
        <Deck>
          <Slide>
            <ul>
              <Step component="li" with="content" data-name="a">
                <Paragraph>
                  a<Step data-name="more">more</Step>
                </Paragraph>
              </Step>
            </ul>
            <Step overlay data-name="callout">
              callout
            </Step>
            <Step with="content" data-name="b">
              b
            </Step>
          </Slide>
        </Deck>,
      );
      // The second one joins the first one, skipping the overlay.
      expect(shownItems()).toEqual(['*a', '*', '*b']);
      await user.keyboard('{ArrowRight}');
      expect(window.location.hash).toBe('#slide=1&step=0.1');
      expect(shownItems()).toEqual(['*a', '*', '*more', '*b']);
    });

    it('leaves overlays that are shown with the previous step together', async () => {
      const states = await walk(
        <>
          <Paragraph data-name="a">a</Paragraph>
          <Step overlay data-name="x">
            x
          </Step>
          <Step overlay with="previous" data-name="y">
            y
          </Step>
          <Paragraph data-name="b">b</Paragraph>
        </>,
        1,
      );
      expect(states).toEqual([
        ['*a', '*b'],
        ['*a', '*x', '*y', '*b'],
      ]);
    });

    it('joins an overlay with the previous step explicitly', async () => {
      const states = await walk(
        <>
          <Step overlay data-name="x">
            x
          </Step>
          <Step with="previous" data-name="a">
            a
          </Step>
        </>,
        1,
      );
      expect(states).toEqual([[], ['*x', '*a']]);
    });
  });

  it('nests steps in joining items in the step the item is part of', async () => {
    const user = userEvent.setup();
    render(
      <Deck>
        <Slide>
          <ul>
            <ListItem step data-name="a">
              a
            </ListItem>
            <ListItem data-name="b">
              <Paragraph data-name="b.p">b</Paragraph>
              <Paragraph step data-name="b.more">
                more
              </Paragraph>
            </ListItem>
          </ul>
          <Paragraph data-name="after">after</Paragraph>
        </Slide>
      </Deck>,
    );
    await user.keyboard('{ArrowRight}');
    expect(shownItems()).toEqual(['*a', '*b', '*b.p', '*after']);
    await user.keyboard('{ArrowRight}');
    expect(window.location.hash).toBe('#slide=1&step=1.1');
    expect(shownItems()).toEqual(['*a', '*b', '*b.p', '*b.more', '*after']);
  });

  it('numbers steps in joining steps without a step as steps of the slide', async () => {
    const user = userEvent.setup();
    render(
      <Deck>
        <Slide>
          <ul>
            <ListItem>
              <ul>
                <ListItem>
                  <ul>
                    <ListItem step>deep</ListItem>
                  </ul>
                </ListItem>
              </ul>
            </ListItem>
          </ul>
        </Slide>
      </Deck>,
    );
    await user.keyboard('{ArrowRight}');
    expect(window.location.hash).toBe('#slide=1&step=1');
  });

  it('shows joining steps with the latest step on their level, wherever they are', async () => {
    const user = userEvent.setup();
    render(
      <Deck>
        <Slide>
          <Paragraph data-name="a">a</Paragraph>
          <Paragraph step data-name="b">
            b
          </Paragraph>
          <div>
            <Paragraph data-name="c">c</Paragraph>
          </div>
        </Slide>
      </Deck>,
    );
    expect(shownItems()).toEqual(['*a']);
    await user.keyboard('{ArrowRight}');
    expect(shownItems()).toEqual(['*a', '*b', '*c']);
  });

  it('keeps steppers with several steps out of the step they are placed with', async () => {
    const user = userEvent.setup();
    function Several() {
      const { ref } = useSteps(2, { with: 'previous' });
      return <div ref={ref} />;
    }
    render(
      <Deck>
        <Slide>
          <Step data-name="a" />
          <Several />
        </Slide>
      </Deck>,
    );
    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(window.location.hash).toBe('#slide=1&step=2');
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

  it('takes the defaults of a stepper like those of a step', async () => {
    const user = userEvent.setup();
    function Joining() {
      const { ref } = useStep({ defaults: { joins: 'content' } });
      return <div ref={ref} />;
    }
    render(
      <Deck>
        <Slide>
          <Step data-name="a" />
          <Joining />
          <Step data-name="b" />
        </Slide>
      </Deck>,
    );
    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(window.location.hash).toBe('#slide=1&step=2');
    expect(shownItems()).toEqual(['a', '*b']);
  });

  it('creates a step by default only with with, not joins', async () => {
    const user = userEvent.setup();
    render(
      <Deck>
        <Slide>
          <Step defaults={{ joins: 'content' }} data-name="joins">
            joins <Step data-name="in joins">inside</Step>
          </Step>
          <Step defaults={{ with: 'content' }} data-name="with">
            with <Step data-name="in with">inside</Step>
          </Step>
        </Slide>
      </Deck>,
    );
    // The first one is part of nothing, so the step inside it is a step of the
    // slide, which the second one joins.
    expect(shownItems()).toEqual(['*joins']);
    await user.keyboard('{ArrowRight}');
    expect(window.location.hash).toBe('#slide=1&step=1');
    expect(shownItems()).toEqual(['*joins', '*in joins', '*with']);
    await user.keyboard('{ArrowRight}');
    expect(window.location.hash).toBe('#slide=1&step=1.1');
    expect(shownItems()).toEqual(['*joins', '*in joins', '*with', '*in with']);
  });

  it.each([[false], ['false' as const]])(
    'treats step=%j like with="parent", unless with is set',
    async (step) => {
      const user = userEvent.setup();
      render(
        <Deck>
          <Slide>
            <Step with="initial" data-name="first">
              first
            </Step>
            <Step step={step} data-name="not a step">
              not a step <Step data-name="inside">inside</Step>
            </Step>
            <Step step={step} with="self" data-name="own">
              own
            </Step>
          </Slide>
        </Deck>,
      );
      expect(shownItems()).toEqual(['*first', '*not a step']);
      await user.keyboard('{ArrowRight}');
      expect(window.location.hash).toBe('#slide=1&step=1');
      await user.keyboard('{ArrowRight}');
      expect(window.location.hash).toBe('#slide=1&step=2');
      expect(shownItems()).toContain('*own');
    },
  );

  it('places with="parent" with what encloses it', async () => {
    const user = userEvent.setup();
    render(
      <Deck>
        <Slide>
          <Step with="initial" data-name="first">
            first
          </Step>
          <Paragraph with="parent" data-name="stays">
            stays
          </Paragraph>
          <Paragraph data-name="too">
            too <Step data-name="inside">inside</Step>
          </Paragraph>
          <Step data-name="next">next</Step>
        </Slide>
      </Deck>,
    );
    expect(shownItems()).toEqual(['*first', '*stays', '*too']);
    await user.keyboard('{ArrowRight}');
    // The step inside it is a step of the slide, not nested in the initial one.
    expect(window.location.hash).toBe('#slide=1&step=1');
    expect(shownItems()).toEqual(['first', '*stays', '*too', '*inside']);
  });

  it('follows a group where it is placed, not at its later elements', async () => {
    const user = userEvent.setup();
    render(
      <Deck>
        <Slide>
          <Step group="a" data-name="a1">
            a1
          </Step>
          <Step group="b" data-name="b1">
            b1
          </Step>
          <Step group="a" data-name="a2">
            a2
          </Step>
          <Paragraph data-name="p">p</Paragraph>
        </Slide>
      </Deck>,
    );
    await user.keyboard('{ArrowRight}');
    expect(shownItems()).toEqual(['*a1', '*a2']);
    await user.keyboard('{ArrowRight}');
    expect(shownItems()).toEqual(['a1', '*b1', 'a2', '*p']);
  });

  it('shows content after Steps at their last step, unless they are an overlay', async () => {
    const user = userEvent.setup();
    render(
      <Deck>
        <Slide>
          <Step data-name="a">a</Step>
          <Steps count={2} overlay>
            overlay
          </Steps>
          <Paragraph data-name="with a">with a</Paragraph>
          <Steps count={2}>figure</Steps>
          <Paragraph data-name="with figure">with figure</Paragraph>
        </Slide>
      </Deck>,
    );
    await user.keyboard('{ArrowRight}');
    expect(shownItems()).toEqual(['*a', '*with a']);
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');
    expect(window.location.hash).toBe('#slide=1&step=4');
    expect(shownItems()).toEqual(['a', 'with a']);
    await user.keyboard('{ArrowRight}');
    expect(window.location.hash).toBe('#slide=1&step=5');
    expect(shownItems()).toEqual(['a', 'with a', '*with figure']);
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

  it('shows the steps of a group together', async () => {
    const user = userEvent.setup();
    render(
      <Deck>
        <Slide>
          <ul>
            <Step component="li" data-name="a">
              a
            </Step>
            <Step component="li" data-name="b">
              b
            </Step>
            <Step component="li" with="previous" data-name="c">
              c
              <ul>
                <Step component="li" data-name="c.1">
                  c.1
                </Step>
              </ul>
            </Step>
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
      // Steps of groups are referred to by the names of the groups.
      expect(window.location.hash).toBe('#slide=1&step=b');
    });

    it('nests a group wherever it is first found', async () => {
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
      expect(shownItems()).toEqual(['*x', '*a1', '*a2']);
      expect(window.location.hash).toBe('#slide=1&step=a');
      await user.keyboard('{ArrowRight}');
      expect(shownItems()).toEqual(['*x', '*a1', '*a1.1', '*a2']);
      expect(window.location.hash).toBe('#slide=1&step=a.1');
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
