import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Formula, formulaClasses } from './Formula.tsx';

describe('Formula', () => {
  afterEach(cleanup);

  it('renders inline formulas in a span', () => {
    render(
      <p>
        Text <Formula>x</Formula>
      </p>,
    );
    const formula = screen.getByText('x');
    expect(formula.tagName).toBe('SPAN');
    expect([...formula.classList]).toEqual(
      expect.arrayContaining([formulaClasses.root, formulaClasses.inline]),
    );
  });

  it('renders display formulas in a div', () => {
    render(
      <Formula display fullWidth minWidth="12ex">
        x
      </Formula>,
    );
    const formula = screen.getByText('x');
    expect(formula.tagName).toBe('DIV');
    expect(formula.classList.contains(formulaClasses.display)).toBe(true);
    expect(formula.style.minWidth).toBe('12ex');
  });
});
