import { Deck, Slide, stepClasses } from '@slider/core';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Column, columnClasses } from './Column.tsx';
import { Columns } from './Columns.tsx';

describe('Columns', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '#');
  });

  afterEach(() => {
    cleanup();
  });

  it('sizes columns with flexbox and reveals them as steps', async () => {
    const user = userEvent.setup();
    render(
      <Deck>
        <Slide>
          <Columns gap={48} align="center" data-testid="columns">
            <Column heading="First" data-testid="first">
              <p>One</p>
            </Column>
            <Column step grow="2" data-testid="second">
              <p>Two</p>
            </Column>
            <Column width="200" data-testid="third">
              <p>Three</p>
            </Column>
          </Columns>
        </Slide>
      </Deck>,
    );
    const style = (testId: string) =>
      getComputedStyle(screen.getByTestId(testId));
    expect(style('columns').display).toBe('flex');
    expect(style('columns').gap).toBe('48px');
    expect(style('columns').alignItems).toBe('center');
    expect(style('first').flex).toBe('1 1 0px');
    expect(style('second').flex).toBe('2 1 0px');
    expect(style('third').flex).toBe('0 0 200px');
    const heading = screen.getByRole('heading', { name: 'First' });
    expect(heading.classList).toContain(columnClasses.heading);
    expect(getComputedStyle(heading).textAlign).toBe('center');
    const phase = (testId: string) =>
      screen.getByTestId(testId).classList.contains(stepClasses.future);
    // The second column is a step, and the third is shown with it.
    expect([phase('first'), phase('second'), phase('third')]).toEqual([
      false,
      true,
      true,
    ]);
    await user.keyboard('{ArrowRight}');
    expect([phase('second'), phase('third')]).toEqual([false, false]);
  });
});
