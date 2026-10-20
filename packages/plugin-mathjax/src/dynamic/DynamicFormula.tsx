import type { SxProps, Theme } from '@mui/material/styles';
import { useEffect, useEffectEvent, useState, type JSX } from 'react';

import { useCached, useSliderOptions, useSlideView } from '@slider/core';

import { Formula } from '../Formula.tsx';
import {
  isRuntimeMathOptions,
  type RuntimeDynamicMath,
} from './runtimeOptions.ts';
import type { RenderedFormula } from './render.ts';
import { formulaCache } from './formulaCache.ts';

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

function CachedFormula({
  dynamic,
  tex,
  display = false,
  macros,
  tags,
  onError,
  ...other
}: Omit<DynamicFormulaProps, 'macros' | 'tags'> & {
  dynamic: RuntimeDynamicMath;
  macros: NonNullable<DynamicFormulaProps['macros']>;
  tags: NonNullable<DynamicFormulaProps['tags']>;
}): JSX.Element {
  const { visible } = useSlideView();
  const result = useCached(formulaCache(dynamic), {
    tex,
    display,
    macros,
    tags,
  });
  const [previous, setPrevious] = useState<RenderedFormula>();
  if (result.status === 'success' && result.value !== previous) {
    setPrevious(result.value);
  }
  const reportError = useEffectEvent((message: string) => {
    onError?.(message);
  });
  const error =
    result.status === 'error'
      ? `Cannot render math: ${String(result.error)}`
      : undefined;
  useEffect(() => {
    if (!visible) return;
    if (error !== undefined) reportError(error);
    else if (result.status === 'success') {
      for (const message of result.value.errors) reportError(message);
    }
  }, [visible, result, error]);
  const formula = result.value ?? previous;
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

/**
 * A formula rendered by MathJax in the browser, for math that changes while
 * the deck is shown, like the input of a widget.
 *
 * Takes the `math` options of the deck, which must enable `dynamic` math.
 * MathJax is loaded in the background when a `DynamicFormula` is probed or
 * shown. Typesetting waits for a visible view, and identical formulas share
 * their results across views. While the formula changes, it shows the formula
 * it rendered before.
 * Changes of the slide wait for the formula to be rendered, so that the
 * slide doesn't shift when it appears.
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
  const reportError = useEffectEvent((message: string) => {
    onError?.(message);
  });
  const dynamic = deck?.dynamic;
  const unavailable =
    dynamic !== undefined
      ? undefined
      : deck === undefined
        ? 'DynamicFormula only works in decks with @slider/plugin-mathjax'
        : 'Enable `dynamic` in the `math` options of the deck to show a DynamicFormula';
  useEffect(() => {
    if (visible && unavailable !== undefined) reportError(unavailable);
  }, [visible, unavailable]);
  if (dynamic !== undefined) {
    return (
      <CachedFormula
        dynamic={dynamic}
        tex={tex}
        display={display}
        macros={{ ...deck?.macros, ...macros }}
        tags={tags ?? deck?.tags ?? 'ams'}
        onError={onError}
        {...other}
      />
    );
  }
  return (
    <Formula display={display} {...other}>
      <span style={{ color: 'red' }} title={unavailable}>
        {tex}
      </span>
    </Formula>
  );
}
