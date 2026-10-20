import type { SxProps, Theme } from '@mui/material/styles';
import { useEffect, useEffectEvent, useState, type JSX } from 'react';

import {
  useSliderOptions,
  useSlideView,
  useTransitionHold,
} from '@slider/core';

import { Formula } from '../Formula.tsx';
import { isRuntimeMathOptions } from './runtimeOptions.ts';
import type { RenderedFormula } from './render.ts';

export interface DynamicFormulaProps {
  /** The formula in TeX, like `x^{2}`. */
  tex: string;
  /** Whether the formula is shown on its own line, like `$$…$$` in TeX. */
  display?: boolean | undefined;
  /**
   * TeX macros, like `{ R: '\\mathbb{R}', norm: ['\\lVert #1 \\rVert', 1] }`,
   * besides those of the deck.
   */
  macros?: Record<string, string | [string, number]> | undefined;
  /** Which equations are numbered. Defaults to the `tags` of the deck. */
  tags?: 'none' | 'ams' | 'all' | undefined;
  /** Called with errors, like those of TeX, which are also shown in red. */
  onError?: ((message: string) => void) | undefined;
  className?: string;
  sx?: SxProps<Theme>;
}

/** The result of rendering, or why the formula can't be rendered. */
type Rendered = (RenderedFormula | { error: string }) & {
  /** What was rendered, to tell whether it's the current formula. */
  key: string;
};

/**
 * How long a change of the slide may wait for the formula, in milliseconds,
 * which may need to load MathJax and its font first.
 */
const RENDER_DEADLINE = 1000;

/**
 * A formula rendered by MathJax in the browser, for math that changes while
 * the deck is shown, like the input of a widget.
 *
 * Takes the `math` options of the deck, which must enable `dynamic` math.
 * MathJax is only loaded when a `DynamicFormula` is first shown. Until then,
 * and while the formula changes, it shows the formula it rendered before.
 * Changes of the slide wait for the formula to be rendered, so that the
 * slide doesn't shift when it appears. Probe views skip rendering.
 *
 * Can be themed as `SliderFormula`, like the math of decks.
 */
export function DynamicFormula({
  tex,
  display = false,
  macros,
  tags,
  onError,
  ...other
}: DynamicFormulaProps): JSX.Element {
  const { visible } = useSlideView();
  const options = useSliderOptions('math');
  const deck = isRuntimeMathOptions(options) ? options : undefined;
  const [rendered, setRendered] = useState<Rendered>();
  const reportError = useEffectEvent((message: string) => {
    onError?.(message);
  });
  const dynamic = deck?.dynamic;
  // Compare the macros by their value, since they're often written inline.
  const macrosKey = JSON.stringify({ ...deck?.macros, ...macros });
  const effectiveTags = tags ?? deck?.tags ?? 'ams';
  const unavailable =
    dynamic !== undefined
      ? undefined
      : deck === undefined
        ? 'DynamicFormula only works in decks with @slider/plugin-mathjax'
        : 'Enable `dynamic` in the `math` options of the deck to show a DynamicFormula';
  const key = JSON.stringify([tex, display, macrosKey, effectiveTags]);
  // Hold the change of the slide until the formula is rendered, so that the
  // slide doesn't shift when it appears.
  useTransitionHold(
    visible && unavailable === undefined && rendered?.key !== key,
    { deadline: RENDER_DEADLINE },
  );
  useEffect(() => {
    if (!visible) return;
    if (dynamic === undefined) {
      if (unavailable !== undefined) {
        reportError(unavailable);
      }
      return;
    }
    let current = true;
    const allMacros = JSON.parse(macrosKey) as Record<
      string,
      string | [string, number]
    >;
    dynamic
      .loadRenderer()
      .then(({ renderFormula }) =>
        renderFormula(tex, {
          display,
          font: dynamic.font,
          macros: allMacros,
          tags: effectiveTags,
          onError: (message) => {
            if (current) {
              reportError(message);
            }
          },
        }),
      )
      .then(
        (formula) => {
          if (current) {
            setRendered({ ...formula, key });
          }
        },
        (error: unknown) => {
          if (current) {
            const message = `Cannot render math: ${String(error)}`;
            setRendered({ error: message, key });
            reportError(message);
          }
        },
      );
    return () => {
      current = false;
    };
  }, [
    visible,
    tex,
    display,
    dynamic,
    unavailable,
    macrosKey,
    effectiveTags,
    key,
  ]);
  const error =
    unavailable ??
    (rendered !== undefined && 'error' in rendered
      ? rendered.error
      : undefined);
  const formula =
    rendered !== undefined && 'svg' in rendered ? rendered : undefined;
  if (error !== undefined) {
    return (
      <Formula display={display} {...other}>
        <span style={{ color: 'red' }} title={error}>
          {tex}
        </span>
      </Formula>
    );
  }
  return (
    <Formula
      display={display}
      fullWidth={formula?.fullWidth}
      minWidth={formula?.minWidth}
      svg={formula?.svg ?? ''}
      mathml={formula?.mathml}
      {...other}
    />
  );
}
