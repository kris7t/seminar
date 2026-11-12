import type { Theme } from '@mui/material/styles';
import { createSlideTheme, Deck, Slide, stepClasses } from '@seminar/core';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Column, columnClasses, type ColumnProps } from './Column.tsx';
import { Columns, type ColumnsProps } from './Columns.tsx';

/**
 * Returns a theme with defaults for `columns` and each `column`, which shows
 * the look of columns as their `--look` CSS variable.
 */
function lookTheme(
  defaults: { columns?: ColumnsProps; column?: ColumnProps } = {},
): Theme {
  return createSlideTheme({
    components: {
      SeminarColumns: { defaultProps: defaults.columns },
      SeminarColumn: {
        defaultProps: defaults.column,
        styleOverrides: {
          root: ({ ownerState }) => ({
            '--look': [
              ownerState.color,
              ownerState.variant,
              ownerState.elevation,
              ownerState.radius,
            ].join(' '),
          }),
        },
      },
    },
  });
}

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
            <Column step grow={2} data-testid="second">
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

  it('takes the look of columns from them, their rows, and the theme', () => {
    const theme = lookTheme({
      columns: { color: 'success', variant: 'card', elevation: 3, radius: 5 },
      column: { color: 'secondary' },
    });
    render(
      <Deck theme={theme}>
        <Slide>
          <Columns>
            <Column data-testid="themed">One</Column>
          </Columns>
          <Columns color="primary" elevation={1}>
            <Column data-testid="row">Two</Column>
            <Column color="error" elevation={99} radius={0} data-testid="own">
              Three
            </Column>
          </Columns>
        </Slide>
      </Deck>,
    );
    const look = (testId: string) =>
      getComputedStyle(screen.getByTestId(testId)).getPropertyValue('--look');
    // The theme of columns overrides that of rows.
    expect(look('themed')).toBe('secondary card 3 5');
    // Rows override the theme of columns.
    expect(look('row')).toBe('primary card 1 5');
    // Columns override their rows, within the shadows of the theme.
    expect(look('own')).toBe('error card 24 0');
  });

  it('looks plain by default', () => {
    const theme = lookTheme();
    render(
      <Deck theme={theme}>
        <Slide>
          <Columns>
            <Column data-testid="default">One</Column>
          </Columns>
        </Slide>
      </Deck>,
    );
    expect(
      getComputedStyle(screen.getByTestId('default')).getPropertyValue(
        '--look',
      ),
    ).toBe(`primary plain 0 ${String(Number(theme.shape.borderRadius) * 2)}`);
  });
});
