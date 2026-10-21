import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import {
  act,
  cleanup,
  render as renderReact,
  waitFor,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SeminarOptionsContext } from '../../../core/src/deck/SeminarOptionsContext.ts';
import { SharedWorkProvider } from '../../../core/src/shared/SharedWorkProvider.tsx';
import {
  SlideTransitions,
  SlideTransitionsContext,
} from '../../../core/src/transitions/SlideTransitions.ts';
import { SlideViewProvider } from '../../../core/src/view/SlideViewProvider.tsx';
import type { SlideViewKind } from '../../../core/src/view/SlideViewContext.ts';
import { formulaClasses } from '../Formula.tsx';
import { DynamicFormula } from './DynamicFormula.tsx';
import { defineMathFont } from './fonts.ts';
import { renderFormula, type RenderedFormula } from './render.ts';
import type { RuntimeMathOptions } from './runtimeOptions.ts';

const seminarOptions: { math: unknown } = {
  math: undefined,
};

let transitions: SlideTransitions;
let slideKind: SlideViewKind;
const activeHolds = new Set<object>();

function TestContext({ children }: { children: ReactNode }) {
  return (
    <SharedWorkProvider>
      <SeminarOptionsContext value={seminarOptions}>
        <SlideTransitionsContext value={transitions}>
          <SlideViewProvider
            view={{
              index: 0,
              kind: slideKind,
              interactive: slideKind === 'audience',
            }}
          >
            {children}
          </SlideViewProvider>
        </SlideTransitionsContext>
      </SeminarOptionsContext>
    </SharedWorkProvider>
  );
}

function render(ui: ReactNode) {
  return renderReact(ui, { wrapper: TestContext });
}

const STIX2 = path.dirname(
  createRequire(import.meta.filename).resolve(
    '@mathjax/mathjax-stix2-font/package.json',
  ),
);

const DYNAMIC_FILES = readdirSync(path.join(STIX2, 'mjs/svg/dynamic')).filter(
  (file) => file.endsWith('.js'),
);

/** The STIX Two font, as compiled decks define it. */
const stix2Font = defineMathFont(
  () => import(path.join(STIX2, 'mjs/svg.js')),
  Object.fromEntries(
    DYNAMIC_FILES.map((file) => [
      file,
      () => import(path.join(STIX2, 'mjs/svg/dynamic', file)),
    ]),
  ),
);

const OPTIONS = {
  display: false,
  font: stix2Font,
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
    font: 'stix2',
    macros: { R: '\\mathbb{R}' },
    tags: 'none',
    dynamic: { font: stix2Font, loadRenderer: () => import('./render.ts') },
  };

  beforeEach(() => {
    seminarOptions.math = deckOptions;
    slideKind = 'audience';
    transitions = new SlideTransitions();
    activeHolds.clear();
    vi.spyOn(transitions, 'hold').mockImplementation(() => {
      const hold = {};
      activeHolds.add(hold);
      return () => {
        activeHolds.delete(hold);
      };
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('preloads MathJax in probes and waits for visibility before typesetting', async () => {
    const typeset = vi.fn(renderFormula);
    const loadRenderer = vi.fn(() =>
      Promise.resolve({ renderFormula: typeset }),
    );
    seminarOptions.math = {
      ...deckOptions,
      dynamic: { font: stix2Font, loadRenderer },
    };
    slideKind = 'probe';
    const { container, rerender } = render(<DynamicFormula tex="x" />);
    await waitFor(() => {
      expect(loadRenderer).toHaveBeenCalledOnce();
    });
    expect(typeset).not.toHaveBeenCalled();
    expect(activeHolds.size).toBe(0);
    expect(container.querySelector('svg')).toBeNull();

    slideKind = 'audience';
    rerender(<DynamicFormula tex="x" />);
    expect(loadRenderer).toHaveBeenCalledOnce();
    expect(activeHolds.size).toBeGreaterThan(0);
    await waitFor(() => {
      expect(container.querySelector('math')?.getAttribute('data-latex')).toBe(
        'x',
      );
    });
    expect(activeHolds.size).toBe(0);
  });

  it.each([undefined, { ...deckOptions, dynamic: undefined }])(
    'does not report configuration errors in probe views with options %j',
    (options) => {
      seminarOptions.math = options;
      slideKind = 'probe';
      const onError = vi.fn();
      render(<DynamicFormula tex="x" onError={onError} />);
      expect(onError).not.toHaveBeenCalled();
      expect(activeHolds.size).toBe(0);
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
    seminarOptions.math = { ...deckOptions, dynamic: undefined };
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
    const pending = () => activeHolds.size > 0;
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
    seminarOptions.math = { ...deckOptions, dynamic: undefined };
    render(<DynamicFormula tex="x" />);
    expect(activeHolds.size).toBe(0);
  });

  it('reports errors', async () => {
    const onError = vi.fn();
    render(<DynamicFormula tex="\nope" onError={onError} />);
    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith('Undefined control sequence \\nope');
    });
  });

  it('shares typesetting across views with differently ordered formula arrays', async () => {
    const typeset = vi.fn(renderFormula);
    const loadRenderer = vi.fn(() =>
      Promise.resolve({ renderFormula: typeset }),
    );
    seminarOptions.math = {
      ...deckOptions,
      dynamic: { font: stix2Font, loadRenderer },
    };
    const tree = (first: string[], second: string[]) => (
      <>
        <SlideViewProvider
          view={{ index: 0, kind: 'audience', interactive: true }}
        >
          {first.map((tex) => (
            <DynamicFormula key={tex} tex={tex} />
          ))}
        </SlideViewProvider>
        <SlideViewProvider
          view={{ index: 0, kind: 'preview', interactive: false }}
        >
          {second.map((tex) => (
            <DynamicFormula key={tex} tex={tex} />
          ))}
        </SlideViewProvider>
      </>
    );
    const { container, rerender } = render(tree(['x', 'y'], ['y', 'x']));
    await waitFor(() => {
      expect(container.querySelectorAll('math')).toHaveLength(4);
    });
    expect(typeset).toHaveBeenCalledTimes(2);
    expect(loadRenderer).toHaveBeenCalledOnce();
    rerender(tree(['y', 'x'], ['x']));
    await waitFor(() => {
      expect(container.querySelectorAll('math')).toHaveLength(3);
    });
    expect(typeset).toHaveBeenCalledTimes(2);
  });

  it('keeps the previous formula while the new one is pending', async () => {
    const next = Promise.withResolvers<RenderedFormula>();
    const typeset = vi.fn(
      (tex: string, options: Parameters<typeof renderFormula>[1]) =>
        tex === 'y' ? next.promise : renderFormula(tex, options),
    );
    seminarOptions.math = {
      ...deckOptions,
      dynamic: {
        font: stix2Font,
        loadRenderer: () => Promise.resolve({ renderFormula: typeset }),
      },
    };
    const { container, rerender } = render(<DynamicFormula tex="x" />);
    await waitFor(() => {
      expect(container.querySelector('math')?.getAttribute('data-latex')).toBe(
        'x',
      );
    });
    rerender(<DynamicFormula tex="y" />);
    expect(container.querySelector('math')?.getAttribute('data-latex')).toBe(
      'x',
    );
    await act(async () => {
      next.resolve(await renderFormula('y', OPTIONS));
    });
    expect(container.querySelector('math')?.getAttribute('data-latex')).toBe(
      'y',
    );
  });

  it('includes display mode, macros, and numbering in the cache key', async () => {
    const typeset = vi.fn(renderFormula);
    seminarOptions.math = {
      ...deckOptions,
      dynamic: {
        font: stix2Font,
        loadRenderer: () => Promise.resolve({ renderFormula: typeset }),
      },
    };
    const { container } = render(
      <>
        <DynamicFormula tex={'\\A'} macros={{ A: 'a', B: 'b' }} />
        <DynamicFormula tex={'\\A'} macros={{ B: 'b', A: 'a' }} />
        <DynamicFormula tex={'\\A'} macros={{ A: 'a', B: 'b' }} display />
        <DynamicFormula tex={'\\A'} macros={{ A: 'c', B: 'b' }} />
        <DynamicFormula tex={'\\A'} macros={{ A: 'a', B: 'b' }} tags="ams" />
      </>,
    );
    await waitFor(() => {
      expect(container.querySelectorAll('math')).toHaveLength(5);
    });
    expect(typeset).toHaveBeenCalledTimes(4);
  });

  it('keeps caches separate when the runtime font configuration changes', async () => {
    const typeset = vi.fn(renderFormula);
    const loadRenderer = () => Promise.resolve({ renderFormula: typeset });
    seminarOptions.math = {
      ...deckOptions,
      dynamic: { font: stix2Font, loadRenderer },
    };
    const { container, rerender } = render(<DynamicFormula tex="x" />);
    await waitFor(() => {
      expect(container.querySelector('svg')).not.toBeNull();
    });
    const otherFont = { ...stix2Font };
    seminarOptions.math = {
      ...deckOptions,
      dynamic: { font: otherFont, loadRenderer },
    };
    rerender(<DynamicFormula tex="x" />);
    await waitFor(() => {
      expect(typeset).toHaveBeenCalledTimes(2);
    });
    expect(typeset.mock.calls[0]?.[1].font).toBe(stix2Font);
    expect(typeset.mock.calls[1]?.[1].font).toBe(otherFont);
    await waitFor(() => {
      expect(activeHolds.size).toBe(0);
    });
  });

  it('reports cached TeX errors to each consumer, including consumers mounted later', async () => {
    const typeset = vi.fn(renderFormula);
    seminarOptions.math = {
      ...deckOptions,
      dynamic: {
        font: stix2Font,
        loadRenderer: () => Promise.resolve({ renderFormula: typeset }),
      },
    };
    const firstError = vi.fn();
    const secondError = vi.fn();
    const tree = (second: boolean) => (
      <>
        <DynamicFormula key="first" tex={'\\nope'} onError={firstError} />
        {second && (
          <DynamicFormula key="second" tex={'\\nope'} onError={secondError} />
        )}
      </>
    );
    const { rerender } = render(tree(false));
    await waitFor(() => {
      expect(firstError).toHaveBeenCalledExactlyOnceWith(
        'Undefined control sequence \\nope',
      );
    });
    rerender(tree(true));
    await waitFor(() => {
      expect(secondError).toHaveBeenCalledExactlyOnceWith(
        'Undefined control sequence \\nope',
      );
    });
    expect(firstError).toHaveBeenCalledOnce();
    expect(typeset).toHaveBeenCalledOnce();
  });

  it('reports loader failures and releases transition holds', async () => {
    seminarOptions.math = {
      ...deckOptions,
      dynamic: {
        font: stix2Font,
        loadRenderer: () => Promise.reject(new Error('unavailable')),
      },
    };
    const onError = vi.fn();
    const { container } = render(<DynamicFormula tex="x" onError={onError} />);
    await waitFor(() => {
      expect(onError).toHaveBeenCalledExactlyOnceWith(
        'Cannot render math: Error: unavailable',
      );
    });
    expect(container.textContent).toBe('x');
    expect(activeHolds.size).toBe(0);
  });

  it('uses the latest error callback without restarting pending work', async () => {
    const renderer = Promise.withResolvers<{
      renderFormula: typeof renderFormula;
    }>();
    const typeset = vi.fn(renderFormula);
    seminarOptions.math = {
      ...deckOptions,
      dynamic: { font: stix2Font, loadRenderer: () => renderer.promise },
    };
    const previousError = vi.fn();
    const currentError = vi.fn();
    const { rerender } = render(
      <DynamicFormula tex={'\\nope'} onError={previousError} />,
    );
    rerender(<DynamicFormula tex={'\\nope'} onError={currentError} />);
    await act(async () => {
      renderer.resolve({ renderFormula: typeset });
      await renderer.promise;
    });
    await waitFor(() => {
      expect(currentError).toHaveBeenCalledExactlyOnceWith(
        'Undefined control sequence \\nope',
      );
    });
    expect(previousError).not.toHaveBeenCalled();
    expect(typeset).toHaveBeenCalledOnce();
  });
});
