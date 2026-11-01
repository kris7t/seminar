import { cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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
  'Shown up front': 'initial',
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

  it('shows the initial steps of the slide in its first entry', () => {
    render(
      <Deck defaultShowSteps>
        <Slide title="First">
          <Step with="initial">
            Up front<Step>Nested</Step>
          </Step>
          <Step>Later</Step>
        </Slide>
      </Deck>,
    );
    expect(entries()).toEqual(['*Up front', 'Nested', 'Later [page]']);
  });

  it('goes to the step around initial steps of other steps', async () => {
    const user = userEvent.setup();
    render(
      <Deck defaultShowSteps>
        <Slide title="First">
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
    expect(entries()).toEqual([
      '*Start of the slide',
      'Outer',
      'Inner [initial]',
      'Nested',
      'Later [page]',
    ]);
    const nav = screen.getByRole('navigation', { name: 'Steps' });
    await user.click(within(nav).getByText('Later'));
    expect(window.location.hash).toBe('#slide=1&step=1.1');
    await user.click(within(nav).getByText('Inner'));
    expect(window.location.hash).toBe('#slide=1&step=1');
    expect(entries()).toEqual([
      'Start of the slide',
      '*Outer',
      'Inner [initial]',
      'Nested',
      'Later [page]',
    ]);
  });

  it('emphasizes initial steps of other steps only if a nested step is shown', async () => {
    const user = userEvent.setup();
    render(
      <Deck defaultShowSteps>
        <Slide title="First">
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
    const nav = screen.getByRole('navigation', { name: 'Steps' });
    const weightOf = (text: string) =>
      getComputedStyle(within(nav).getByText(text)).fontWeight;
    await user.click(within(nav).getByText('Outer'));
    expect(window.location.hash).toBe('#slide=1&step=1');
    expect(weightOf('Inner')).not.toBe('500');
    await user.click(within(nav).getByText('Nested'));
    expect(window.location.hash).toBe('#slide=1&step=1.0.1');
    expect(weightOf('Outer')).toBe('500');
    expect(weightOf('Inner')).toBe('500');
    await user.click(within(nav).getByText('Later'));
    expect(window.location.hash).toBe('#slide=1&step=1.1');
    expect(weightOf('Outer')).toBe('500');
    expect(weightOf('Inner')).not.toBe('500');
  });

  it('labels initial steps without text as the start of their step', () => {
    render(
      <Deck defaultShowSteps>
        <Slide title="First">
          <Step>
            Outer
            <Step with="initial">
              <Step>Nested</Step>
            </Step>
            <Step>Later</Step>
          </Step>
        </Slide>
      </Deck>,
    );
    expect(entries()).toContain('Start of the step [initial]');
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
