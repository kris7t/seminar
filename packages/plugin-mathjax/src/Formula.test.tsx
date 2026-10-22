import { cleanup, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';

import { SlideViewContext } from '../../core/src/view/SlideViewContext.ts';

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

  it('only renders the MathML in documents', () => {
    const html = renderToStaticMarkup(
      <SlideViewContext
        value={{ index: 0, kind: 'document', interactive: false }}
      >
        <Formula display mathml='<math display="block" data-latex="x">x</math>'>
          <svg />
        </Formula>
      </SlideViewContext>,
    );
    expect(html).toBe(
      '<div><math display="block" data-latex="x">x</math></div>',
    );
  });
});
