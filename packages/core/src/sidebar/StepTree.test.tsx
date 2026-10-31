import { cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ListItem } from '../content/ListItem.tsx';
import { Deck } from '../deck/Deck.tsx';
import { Slide } from '../slide/Slide.tsx';
import { Step } from '../steps/Step.tsx';
import { Steps } from '../steps/Steps.tsx';

function renderDeck(props: { defaultShowToc?: boolean } = {}) {
  return render(
    <Deck toc={[{ slide: 0 }, { slide: 1 }]} defaultShowSteps {...props}>
      <Slide title="First">
        <Step>
          Intro <Step>detail</Step> <Step with="previous">more</Step>
        </Step>
        <Steps count={2}>Figure</Steps>
        <Step>
          <span aria-hidden>x</span>
        </Step>
      </Slide>
      <Slide title="Second" />
    </Deck>,
  );
}

const MARKS: Record<string, string> = {
  'Exported as a page': 'page',
  'Covers other content': 'overlay',
};

/**
 * Returns the entries of the step tree, marking the current one with `*`,
 * and listing their icons in brackets, e.g., `[page]`.
 */
function entries(): string[] {
  const nav = screen.getByRole('navigation', { name: 'Steps' });
  return within(nav)
    .getAllByRole('button')
    .map((button) => {
      const label =
        button.querySelector('.MuiListItemText-root')?.textContent ?? '';
      const marks = [...button.querySelectorAll('svg title')].map(
        (title) => ` [${MARKS[title.textContent] ?? title.textContent}]`,
      );
      return (
        (button.getAttribute('aria-current') === 'step' ? '*' : '') +
        label +
        marks.join('')
      );
    });
}

/** Returns {@link entries} with how many levels they are indented. */
function indentedEntries(): string[] {
  const nav = screen.getByRole('navigation', { name: 'Steps' });
  const paddings = within(nav)
    .getAllByRole('button')
    .map((button) => Number.parseFloat(getComputedStyle(button).paddingLeft));
  const labels = entries();
  return paddings.map(
    (padding, index) =>
      `${String((padding - (paddings[0] ?? 0)) / 16)} ${labels[index] ?? ''}`,
  );
}

describe('StepTree', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '#');
  });

  afterEach(() => {
    cleanup();
  });

  it('lists the steps of the current slide by their text', () => {
    renderDeck();
    expect(entries()).toEqual([
      '*Start of the slide',
      'Intro',
      // The figure may change in its steps, so it needs a page before them.
      'detail · more [page]',
      'Figure (1/2) [page]',
      'Figure (2/2)',
      'Step 4 [page]',
    ]);
  });

  it('indents steps nested in step 0 below a start entry if there are other steps', async () => {
    const user = userEvent.setup();
    render(
      <Deck defaultShowSteps>
        <Slide title="First">
          <ul>
            <ListItem>
              Up front<Step>Initial</Step>
            </ListItem>
            <ListItem step>
              Second
              <ul>
                <ListItem>
                  <Step>Inner initial</Step>
                </ListItem>
                <ListItem step>Inner</ListItem>
              </ul>
            </ListItem>
          </ul>
        </Slide>
      </Deck>,
    );
    expect(indentedEntries()).toEqual([
      '0 *Start of the slide',
      '1 Initial',
      '0 Second',
      '1 Start of the step',
      '2 Inner initial',
      '1 Inner [page]',
    ]);
    // The start of the slide encloses only the steps nested in step 0.
    const startButton = screen.getByRole('button', {
      name: 'Start of the slide',
    });
    const weight = () =>
      getComputedStyle(
        startButton.querySelector('.MuiListItemText-primary') ?? startButton,
      ).fontWeight;
    const closed = weight();
    await user.keyboard('{ArrowRight}');
    expect(entries()[1]).toBe('*Initial');
    expect(weight()).not.toBe(closed);
    // The step itself is current, rather than its start.
    await user.keyboard('{ArrowRight}');
    expect(entries()[2]).toBe('*Second');
    expect(entries()[3]).toBe('Start of the step');
    expect(weight()).toBe(closed);
    await user.keyboard('{ArrowRight}');
    expect(entries()[4]).toBe('*Inner initial');
    await user.click(screen.getByRole('button', { name: 'Start of the step' }));
    expect(entries()[2]).toBe('*Second');
    expect(window.location.hash).toBe('#slide=1&step=1');
  });

  it('does not indent steps nested in step 0 further without other steps', () => {
    render(
      <Deck defaultShowSteps>
        <Slide title="First">
          <ul>
            <ListItem>
              Up front<Step>Initial</Step>
            </ListItem>
          </ul>
        </Slide>
      </Deck>,
    );
    expect(indentedEntries()).toEqual([
      '0 *Start of the slide',
      '0 Initial [page]',
    ]);
  });

  it('does not indent steps nested in the initial content of a step further without other steps', () => {
    render(
      <Deck defaultShowSteps>
        <Slide title="First">
          <Step>
            Outer
            <ul>
              <ListItem>
                Inner<Step>Nested</Step>
              </ListItem>
            </ul>
          </Step>
        </Slide>
      </Deck>,
    );
    expect(indentedEntries()).toEqual([
      '0 *Start of the slide',
      '0 Outer',
      '1 Nested [page]',
    ]);
  });

  it('labels steps with their titles, which are not tooltips', () => {
    render(
      <Deck defaultShowSteps>
        <Slide title="First">
          <Step title="Short">A long text</Step>
        </Slide>
      </Deck>,
    );
    expect(entries()).toEqual(['*Start of the slide', 'Short [page]']);
    expect(screen.getByText('A long text').hasAttribute('title')).toBe(false);
  });

  it('strikes through steps outside the range, which can be chosen', async () => {
    const user = userEvent.setup();
    render(
      <Deck defaultShowSteps>
        <Slide title="First" from="2">
          <Step>A</Step>
          <Step>B</Step>
        </Slide>
      </Deck>,
    );
    const struck = () =>
      within(screen.getByRole('navigation', { name: 'Steps' }))
        .getAllByRole('button')
        .filter((button) =>
          getComputedStyle(
            button.querySelector('.MuiListItemText-primary') ?? button,
          ).textDecoration.includes('line-through'),
        )
        .map((button) => button.textContent);
    expect(struck()).toEqual(['Start of the slide', 'A']);
    expect(window.location.hash).toBe('#slide=1&step=2');
    await user.click(screen.getByRole('button', { name: 'A' }));
    expect(window.location.hash).toBe('#slide=1&step=1');
  });

  it('goes to steps and highlights the current one', async () => {
    const user = userEvent.setup();
    renderDeck();
    await user.click(screen.getByRole('button', { name: /^detail · more/ }));
    expect(window.location.hash).toBe('#slide=1&step=1.1');
    expect(entries()[2]).toBe('*detail · more [page]');
    // The focus stays where it was, so that Space goes to the next step.
    await user.keyboard(' ');
    expect(window.location.hash).toBe('#slide=1&step=2');
    await user.click(
      screen.getByRole('button', { name: 'Start of the slide' }),
    );
    expect(window.location.hash).toBe('#slide=1');
  });

  it('follows the current slide', async () => {
    const user = userEvent.setup();
    renderDeck();
    await user.keyboard('{PageDown}');
    expect(screen.queryByRole('navigation', { name: 'Steps' })).toBeNull();
    expect(screen.getByText('This slide has no steps.')).toBeDefined();
  });

  it('is toggled with Shift+T, and shares the sidebar with the contents', async () => {
    const user = userEvent.setup();
    renderDeck({ defaultShowToc: true });
    const contents = screen.getByRole('button', { name: 'Contents' });
    const steps = screen.getByRole('button', { name: 'Steps' });
    expect(contents.getAttribute('aria-expanded')).toBe('true');
    expect(steps.getAttribute('aria-expanded')).toBe('true');
    await user.keyboard('{Shift>}T{/Shift}');
    expect(steps.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('navigation', { name: 'Steps' })).toBeNull();
    // The collapsed section stays in the sidebar while the other is expanded.
    await user.click(steps);
    expect(screen.getByRole('navigation', { name: 'Steps' })).toBeDefined();
    await user.click(contents);
    await user.click(steps);
    expect(screen.queryByRole('button', { name: 'Contents' })).toBeNull();
  });
});
