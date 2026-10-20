import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { formulaClasses } from '../Formula.tsx';
import { DynamicFormula } from './DynamicFormula.tsx';
import { defineMathFont } from './fonts.ts';
import { renderFormula } from './render.ts';
import type { RuntimeMathOptions } from './runtimeOptions.ts';

const sliderOptions = vi.hoisted((): { math: unknown } => ({
  math: undefined,
}));

const transitionHold = vi.hoisted(() => vi.fn());
const slideView = vi.hoisted(() => ({ visible: true }));

vi.mock('@slider/core', () => ({
  useSlideView: () => slideView,
  useSliderOptions: (name: string) =>
    name === 'math' ? sliderOptions.math : undefined,
  useTransitionHold: transitionHold,
}));

const FIRA = path.dirname(
  createRequire(import.meta.filename).resolve(
    '@mathjax/mathjax-fira-font/package.json',
  ),
);

const DYNAMIC_FILES = readdirSync(path.join(FIRA, 'mjs/svg/dynamic')).filter(
  (file) => file.endsWith('.js'),
);

/** The Fira font, as compiled decks define it. */
const firaFont = defineMathFont(
  () => import(path.join(FIRA, 'mjs/svg.js')),
  Object.fromEntries(
    DYNAMIC_FILES.map((file) => [
      file,
      () => import(path.join(FIRA, 'mjs/svg/dynamic', file)),
    ]),
  ),
);

const OPTIONS = {
  display: false,
  font: firaFont,
  macros: {},
  tags: 'none',
} as const;

describe('renderFormula', () => {
  it('renders SVG and MathML, loading glyphs as needed', async () => {
    // Double-struck letters are not among the glyphs that the font loads up
    // front.
    const { svg, mathml } = await renderFormula('\\mathbb{R}^{2}', OPTIONS);
    expect(svg).toMatch(/^<svg [^>]*aria-hidden="true"/);
    expect(svg).toContain('<path');
    expect(svg).not.toContain('data-c');
    expect(mathml).toMatch(/^<math [^>]*data-latex="\\mathbb\{R\}\^\{2\}"/);
  });

  it('reports errors', async () => {
    const onError = vi.fn();
    const { svg } = await renderFormula('\\nope', { ...OPTIONS, onError });
    expect(onError).toHaveBeenCalledWith('Undefined control sequence \\nope');
    expect(svg).toContain('<svg');
  });

  it('numbers each formula on its own, without links', async () => {
    const tex = '\\begin{equation}a \\label{a}\\end{equation} \\eqref{a}';
    const first = await renderFormula(tex, {
      ...OPTIONS,
      display: true,
      tags: 'ams',
    });
    const onError = vi.fn();
    const second = await renderFormula(tex, {
      ...OPTIONS,
      display: true,
      tags: 'ams',
      onError,
    });
    expect(onError).not.toHaveBeenCalled();
    expect(second.mathml).toBe(first.mathml);
    expect(first.fullWidth).toBe(true);
    expect(first.svg).not.toContain('<a');
  });

  it('takes macros', async () => {
    const { mathml } = await renderFormula('\\R', {
      ...OPTIONS,
      macros: { R: '\\mathbb{R}' },
    });
    expect(mathml).toContain('mathvariant="double-struck"');
  });
});

describe('defineMathFont', () => {
  it('finds files by their names', async () => {
    const load = vi.fn(() => Promise.resolve('loaded'));
    const font = defineMathFont(() => Promise.resolve({}), {
      'arrows.js': load,
    });
    await expect(font.loadDynamicFile('prefix/arrows.js')).resolves.toBe(
      'loaded',
    );
    await expect(font.loadDynamicFile('greek.js')).rejects.toThrow(
      'The deck has no glyphs greek.js',
    );
  });
});

describe('DynamicFormula', () => {
  const deckOptions: RuntimeMathOptions = {
    font: 'fira',
    macros: { R: '\\mathbb{R}' },
    tags: 'none',
    dynamic: { font: firaFont, loadRenderer: () => import('./render.ts') },
  };

  beforeEach(() => {
    sliderOptions.math = deckOptions;
    slideView.visible = true;
    transitionHold.mockClear();
  });

  afterEach(cleanup);

  it('skips loading math and holding transitions until the view is visible', async () => {
    const loadRenderer = vi.fn(() => import('./render.ts'));
    sliderOptions.math = {
      ...deckOptions,
      dynamic: { font: firaFont, loadRenderer },
    };
    slideView.visible = false;
    const { container, rerender } = render(<DynamicFormula tex="x" />);
    expect(loadRenderer).not.toHaveBeenCalled();
    expect(transitionHold.mock.lastCall?.[0]).toBe(false);
    expect(container.querySelector('svg')).toBeNull();

    slideView.visible = true;
    rerender(<DynamicFormula tex="x" />);
    expect(loadRenderer).toHaveBeenCalledOnce();
    expect(transitionHold.mock.lastCall?.[0]).toBe(true);
    await waitFor(() => {
      expect(container.querySelector('math')?.getAttribute('data-latex')).toBe(
        'x',
      );
    });
    expect(transitionHold.mock.lastCall?.[0]).toBe(false);
  });

  it.each([undefined, { ...deckOptions, dynamic: undefined }])(
    'does not report configuration errors in probe views with options %j',
    (options) => {
      sliderOptions.math = options;
      slideView.visible = false;
      const onError = vi.fn();
      render(<DynamicFormula tex="x" onError={onError} />);
      expect(onError).not.toHaveBeenCalled();
      expect(transitionHold.mock.lastCall?.[0]).toBe(false);
    },
  );

  it('takes the macros of the deck', async () => {
    const { container } = render(<DynamicFormula tex={'\\R'} />);
    await waitFor(() => {
      expect(container.querySelector('math')?.innerHTML).toContain(
        'double-struck',
      );
    });
  });

  it('asks for dynamic math to be enabled', async () => {
    sliderOptions.math = { ...deckOptions, dynamic: undefined };
    const onError = vi.fn();
    const { container } = render(<DynamicFormula tex="x" onError={onError} />);
    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith(
        expect.stringContaining('Enable `dynamic`'),
      );
    });
    expect(container.textContent).toBe('x');
  });

  it('renders the formula once MathJax is loaded', async () => {
    const { container, rerender } = render(<DynamicFormula tex="x" display />);
    const formula = container.firstElementChild;
    expect(formula?.classList.contains(formulaClasses.display)).toBe(true);
    await waitFor(() => {
      expect(formula?.querySelector('svg')).not.toBeNull();
    });
    expect(formula?.querySelector('math')?.getAttribute('data-latex')).toBe(
      'x',
    );
    rerender(<DynamicFormula tex="y" display />);
    await waitFor(() => {
      expect(formula?.querySelector('math')?.getAttribute('data-latex')).toBe(
        'y',
      );
    });
  });

  it('holds the change of the slide until the formula is rendered', async () => {
    const pending = () => transitionHold.mock.lastCall?.[0] as boolean;
    const { container, rerender } = render(<DynamicFormula tex="x" />);
    expect(pending()).toBe(true);
    await waitFor(() => {
      expect(container.querySelector('svg')).not.toBeNull();
    });
    expect(pending()).toBe(false);
    rerender(<DynamicFormula tex="y" />);
    expect(pending()).toBe(true);
    await waitFor(() => {
      expect(pending()).toBe(false);
    });
  });

  it('does not hold the change if it cannot render', () => {
    sliderOptions.math = { ...deckOptions, dynamic: undefined };
    render(<DynamicFormula tex="x" />);
    expect(transitionHold.mock.lastCall?.[0]).toBe(false);
  });

  it('reports errors', async () => {
    const onError = vi.fn();
    render(<DynamicFormula tex="\nope" onError={onError} />);
    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith('Undefined control sequence \\nope');
    });
  });
});
