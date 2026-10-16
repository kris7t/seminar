import { evaluate } from '@mdx-js/mdx';
import * as runtime from 'react/jsx-runtime';
import { describe, expect, it, vi } from 'vitest';

import { sliderMdxOptions } from '../options.ts';
import {
  isComponent,
  renderDeck,
  renderSlideExport,
  STUB_URL,
  THEME_URL,
  text,
} from '../test/compileDeck.ts';
import type { ImportedModule } from '../math/themeConfig.ts';

async function compile(
  source: string,
  options: Parameters<typeof sliderMdxOptions>[0] = {},
) {
  const mdxOptions = sliderMdxOptions({ importSource: STUB_URL, ...options });
  const module = await evaluate(source, {
    ...runtime,
    ...mdxOptions,
    baseUrl: import.meta.url,
  });
  return module as typeof module & { frontmatter: Record<string, unknown> };
}

describe('remarkDirectiveComponents', () => {
  it('renders text, leaf, and container directives with imported components', async () => {
    const module = await compile(
      ':mark[important]{#result .yellow color=gold}\n\n::callout[Short]\n\n:::callout{side=left}\nLong *content*\n:::',
      {
        directives: {
          mark: { source: STUB_URL, exportName: 'Highlighter' },
          callout: { source: STUB_URL, exportName: 'PluginCallout' },
        },
      },
    );
    const deck = renderDeck(module);
    const rendered = [deck.props.children].flat().map(renderSlideExport);
    expect(text(rendered)).toContain(
      '<Highlighter id="result" className="yellow" color="gold">important</Highlighter>',
    );
    expect(text(rendered)).toContain('<PluginCallout>Short</PluginCallout>');
    expect(text(rendered)).toContain(
      '<PluginCallout side="left"><p>Long <em>content</em></p></PluginCallout>',
    );
  });

  it('lets the theme override components registered by plugins', async () => {
    const importModule = vi.fn((): Promise<ImportedModule> =>
      Promise.resolve({
        module: {
          slider: {
            directives: {
              callout: {
                source: STUB_URL,
                exportName: 'ThemeCallout',
              },
            },
          },
          default: {},
        },
      }),
    );
    const module = await compile(
      `---\ntheme: ${THEME_URL}\n---\n\n:::callout\nFrom theme with $x$\n:::`,
      {
        sliderConfigs: [
          {
            source: 'plugin-module',
            base: 'plugin-module',
            config: {
              directives: {
                callout: {
                  source: STUB_URL,
                  exportName: 'PluginCallout',
                },
              },
            },
          },
        ],
        importModule,
      },
    );
    const deck = renderDeck(module);
    const slide = renderSlideExport([deck.props.children].flat()[0]);
    expect(isComponent<Record<string, unknown>>(slide, 'Slide')).toBe(true);
    expect(text(slide)).toContain('<ThemeCallout><p>From theme with ');
    expect(importModule).toHaveBeenCalledOnce();
  });

  it('uses Slider configs supplied by the integration', async () => {
    const module = await compile('::callout[From plugin]', {
      sliderConfigs: [
        {
          source: 'plugin-module',
          base: 'plugin-module',
          config: {
            directives: {
              callout: {
                source: STUB_URL,
                exportName: 'PluginCallout',
              },
            },
          },
        },
      ],
    });
    const deck = renderDeck(module);
    const slide = renderSlideExport([deck.props.children].flat()[0]);
    expect(text(slide)).toContain('<PluginCallout>From plugin</PluginCallout>');
  });
});
