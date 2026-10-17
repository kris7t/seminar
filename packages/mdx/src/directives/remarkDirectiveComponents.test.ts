import { compile as mdxCompile, evaluate } from '@mdx-js/mdx';
import * as runtime from 'react/jsx-runtime';
import { describe, expect, it, vi } from 'vitest';

import { VFile } from 'vfile';

import { sliderMdxOptions } from '../options.ts';
import { parseDirectiveComponents } from './remarkDirectiveComponents.ts';
import {
  isComponent,
  renderDeck,
  renderSlideExport,
  STUB_URL,
  THEME_URL,
  text,
} from '../test/compileDeck.ts';
import type { ImportedModule } from '../config/themeConfig.ts';

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
      ':mark[important]{#result .yellow color=gold}\n\n::callout[Short]{at=640,360 shift=12,-8}\n\n:::callout{side=left}\nLong *content*\n:::',
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
    expect(text(rendered)).toContain(
      '<PluginCallout at="640,360" shift="12,-8">Short</PluginCallout>',
    );
    expect(text(rendered)).toContain(
      '<PluginCallout side="left"><Paragraph>Long <em>content</em></Paragraph></PluginCallout>',
    );
  });

  it('tells components the form and the label of the directive', async () => {
    const module = await compile(
      ':callout[Inline]\n\n::callout[Leaf]\n\n:::callout[Title]{side=left}\nLong *content*\n:::\n\n:::note[Kept]\nBody\n:::',
      {
        directives: {
          callout: {
            source: STUB_URL,
            exportName: 'PluginCallout',
            formProp: 'directive',
            labelProp: 'title',
          },
          note: { source: STUB_URL, exportName: 'Highlighter' },
        },
      },
    );
    const deck = renderDeck(module);
    const rendered = text([deck.props.children].flat().map(renderSlideExport));
    expect(rendered).toContain(
      '<PluginCallout directive="text">Inline</PluginCallout>',
    );
    expect(rendered).toContain(
      '<PluginCallout directive="leaf">Leaf</PluginCallout>',
    );
    expect(rendered).toContain(
      '<PluginCallout side="left" directive="container" title="Title"><Paragraph>Long <em>content</em></Paragraph></PluginCallout>',
    );
    // Without `labelProp`, the label stays the first paragraph.
    expect(rendered).toContain(
      '<Highlighter><p>Kept</p><Paragraph>Body</Paragraph></Highlighter>',
    );
  });

  it('wraps consecutive directives in their wrappers', async () => {
    const module = await compile(
      [
        ':::column[A]\nOne\n:::',
        ':::column[B]\nTwo\n:::',
        'Between',
        ':::column[C]\nThree\n:::',
        '::::columns{gap=8}\n:::column[D]\nFour\n:::\n::::',
      ].join('\n\n'),
      {
        directives: {
          columns: { source: STUB_URL, exportName: 'Highlighter' },
          column: {
            source: STUB_URL,
            exportName: 'PluginCallout',
            labelProp: 'title',
            wrapIn: 'columns',
          },
        },
      },
    );
    const deck = renderDeck(module);
    const rendered = text([deck.props.children].flat().map(renderSlideExport));
    expect(rendered).toContain(
      '<Highlighter><PluginCallout title="A"><Paragraph>One</Paragraph></PluginCallout>' +
        '<PluginCallout title="B"><Paragraph>Two</Paragraph></PluginCallout></Highlighter>' +
        '<Paragraph>Between</Paragraph>' +
        '<Highlighter><PluginCallout title="C"><Paragraph>Three</Paragraph></PluginCallout></Highlighter>' +
        '<Highlighter gap="8"><PluginCallout title="D"><Paragraph>Four</Paragraph></PluginCallout></Highlighter>',
    );
  });

  it('warns about wrappers without components', async () => {
    const file = await mdxCompile(':::column\nOne\n:::', {
      ...sliderMdxOptions({
        importSource: STUB_URL,
        directives: {
          column: {
            source: STUB_URL,
            exportName: 'PluginCallout',
            wrapIn: 'missing',
          },
        },
      }),
    });
    expect(file.messages.map(({ reason }) => reason)).toContain(
      'The `column` directive is wrapped in the `missing` directive, which has no component',
    );
  });

  it('warns about invalid props in directive configs', () => {
    const file = new VFile();
    expect(
      parseDirectiveComponents(
        { callout: { source: 'pkg', exportName: 'Callout', formProp: 3 } },
        'the test config',
        file,
      ),
    ).toEqual({ callout: { source: 'pkg', exportName: 'Callout' } });
    expect(file.messages.map(({ reason }) => reason)).toEqual([
      'Expected `formProp` of the `callout` directive in the test config to be a nonempty string',
    ]);
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
    expect(text(slide)).toContain('<ThemeCallout><Paragraph>From theme with ');
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
