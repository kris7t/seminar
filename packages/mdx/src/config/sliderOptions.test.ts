import { evaluate } from '@mdx-js/mdx';
import { isValidElement, type ReactNode } from 'react';
import * as runtime from 'react/jsx-runtime';
import type { VFile } from 'vfile';
import { describe, expect, it } from 'vitest';

import { emptyMdxPlugins } from './deckSetup.ts';
import { sliderMdxOptions } from '../options.ts';
import { STUB_URL } from '../test/compileDeck.ts';
import { setRuntimeSliderOptions } from './sliderOptions.ts';

/** Compiles a deck with configs that set options, and returns its options. */
async function deckOptions(source: string, rehypePlugin?: () => void) {
  const module = await evaluate(source, {
    ...runtime,
    ...sliderMdxOptions({
      importSource: STUB_URL,
      sliderConfigs: [
        {
          source: 'plugin',
          base: import.meta.filename,
          config: { options: { code: { theme: 'light', wrap: true } } },
        },
        {
          source: 'theme',
          base: import.meta.filename,
          config: { options: { code: { theme: 'dark' }, other: { a: 1 } } },
        },
      ],
      mdxPlugins: {
        ...emptyMdxPlugins(),
        rehypePlugins: {
          before: [],
          after: rehypePlugin === undefined ? [] : [rehypePlugin],
        },
      },
    }),
    baseUrl: import.meta.url,
  });
  const deck = (module.default as (props: object) => ReactNode)({});
  if (!isValidElement<{ options?: unknown }>(deck)) {
    throw new Error('Expected a Deck');
  }
  return deck.props.options;
}

describe('options of decks in the browser', () => {
  it('passes the options of the configs and the frontmatter to the deck', async () => {
    expect(
      await deckOptions('---\ncode:\n  wrap: false\n---\n\n# Slide'),
    ).toEqual({
      code: { theme: 'dark', wrap: false },
      other: { a: 1 },
    });
  });

  it('lets plugins replace options with code', async () => {
    expect(
      await deckOptions('# Slide', () => (_tree: unknown, file: VFile) => {
        setRuntimeSliderOptions(file, 'code', '{ lines: [1, 2].length }');
        setRuntimeSliderOptions(file, 'extra', 'true');
      }),
    ).toEqual({ code: { lines: 2 }, other: { a: 1 }, extra: true });
  });
});
