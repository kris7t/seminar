import { VFile } from 'vfile';
import { describe, expect, it } from 'vitest';

import { createFormulaTypesetter } from './typesetFormula.ts';

describe('createFormulaTypesetter', () => {
  it('typesets formulas as SVG without ids, sized in ems', async () => {
    const typeset = await createFormulaTypesetter(new VFile());
    const formula = typeset('x^2', () => undefined);
    expect(formula?.svg).toMatch(/^<svg[^>]* width="100%" height="100%"/);
    expect(formula?.svg).not.toMatch(/ id=|<use/);
    expect(formula?.svg).toContain('currentColor');
    expect(formula?.width).toBeGreaterThan(0.5);
    expect(formula?.width).toBeLessThan(2);
    expect(formula?.height).toBeGreaterThan(0.5);
    expect(formula?.height).toBeLessThan(2);
  });

  it('reports errors of TeX', async () => {
    const typeset = await createFormulaTypesetter(new VFile());
    const errors: string[] = [];
    typeset('\\undefinedMacro', (message) => errors.push(message));
    expect(errors).toEqual(['Undefined control sequence \\undefinedMacro']);
  });
});
