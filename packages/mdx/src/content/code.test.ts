import { evaluate } from '@mdx-js/mdx';
import type { Element } from 'hast';
import * as runtime from 'react/jsx-runtime';
import { describe, expect, it } from 'vitest';

import type { ModuleImporter } from '../config/themeConfig.ts';
import { sliderMdxOptions } from '../options.ts';
import {
  renderDeck,
  renderSlideExport,
  STUB_URL,
  text,
} from '../test/compileDeck.ts';
import type { CodeHighlighter } from './rehypeCode.ts';

async function render(
  source: string,
  code: Record<string, unknown> | undefined,
  highlight?: CodeHighlighter,
): Promise<string> {
  const importModule: ModuleImporter = (specifier) =>
    Promise.resolve({ module: { [specifier]: highlight } });
  const module = await evaluate(source, {
    ...runtime,
    ...sliderMdxOptions({
      importSource: STUB_URL,
      importModule,
      sliderConfigs:
        code === undefined
          ? []
          : [{ source: 'plugin', base: 'plugin', config: { code } }],
    }),
    baseUrl: import.meta.url,
  });
  const deck = renderDeck(
    module as typeof module & { frontmatter: Record<string, unknown> },
  );
  return text([deck.props.children].flat().map(renderSlideExport));
}

const COMPONENT = { source: STUB_URL, exportName: 'CodeBlock' };

const BLOCK = '```ts {1|2}\nconst a = 1;\nconst b = 2;\n```';

/** Highlights by marking the code, with the options as attributes. */
const fakeHighlight: CodeHighlighter = ({ code, lang }, options) =>
  ({
    type: 'element',
    tagName: 'pre',
    properties: { dataLang: lang, dataOptions: JSON.stringify(options) },
    children: [
      {
        type: 'element',
        tagName: 'mark',
        properties: {},
        children: [{ type: 'text', value: code }],
      },
    ],
  }) satisfies Element;

describe('rehypeCode', () => {
  it('keeps code blocks without a config', async () => {
    expect(await render(BLOCK, undefined)).toContain(
      '<pre><code>const a = 1;\nconst b = 2;\n</code></pre>',
    );
  });

  it('renders code blocks with the component of the config', async () => {
    expect(await render(BLOCK, { component: COMPONENT })).toContain(
      '<CodeBlock lang="ts" meta="{1|2}" code="const a = 1;\\nconst b = 2;">' +
        '<pre><code>const a = 1;\nconst b = 2;\n</code></pre></CodeBlock>',
    );
  });

  it('highlights code blocks with the highlighter of the config', async () => {
    const rendered = await render(
      `---\ncode:\n  theme: dark\n---\n\n${BLOCK}`,
      {
        component: COMPONENT,
        highlighter: { source: 'highlight', exportName: 'highlight' },
        options: { theme: 'light', tabs: 2 },
      },
      fakeHighlight,
    );
    expect(rendered).toContain(
      '<pre><mark>const a = 1;\nconst b = 2;</mark></pre></CodeBlock>',
    );
  });

  it('passes the merged options to the highlighter', async () => {
    let seen: Record<string, unknown> | undefined;
    await render(
      `---\ncode:\n  theme: dark\n---\n\n${BLOCK}`,
      {
        highlighter: { source: 'highlight', exportName: 'highlight' },
        options: { theme: 'light', tabs: 2 },
      },
      (block, options) => {
        seen = options;
        return fakeHighlight(block, options);
      },
    );
    expect(seen).toEqual({ theme: 'dark', tabs: 2 });
  });

  it('shows code blocks as they are if highlighting fails', async () => {
    expect(
      await render(
        BLOCK,
        { highlighter: { source: 'highlight', exportName: 'highlight' } },
        () => {
          throw new Error('Unknown language');
        },
      ),
    ).toContain('<pre><code>const a = 1;\nconst b = 2;\n</code></pre>');
  });

  it('leaves inline code alone', async () => {
    expect(
      await render('Some `code` here', { component: COMPONENT }),
    ).toContain('<code>code</code>');
  });
});
