import { fileURLToPath } from 'node:url';
import { compile as mdxCompile, evaluate } from '@mdx-js/mdx';
import * as runtime from 'react/jsx-runtime';
import { describe, expect, it, vi } from 'vitest';

import { VFile } from 'vfile';

import { seminarMdxOptions } from '../options.ts';
import { parseDirectiveComponents } from './remarkDirectiveComponents.ts';
import {
  isComponent,
  renderDeck,
  renderSlideExport,
  STUB_URL,
  THEME_URL,
  text,
  withThemeConfig,
} from '../test/compileDeck.ts';
import type { ImportedModule, ModuleImporter } from '../config/themeConfig.ts';

async function compile(
  source: string,
  {
    importModule,
    ...options
  }: Parameters<typeof seminarMdxOptions>[0] & {
    importModule?: ModuleImporter;
  } = {},
) {
  const mdxOptions = seminarMdxOptions(
    await withThemeConfig(
      source,
      fileURLToPath(import.meta.url),
      { importSource: STUB_URL, ...options },
      importModule,
    ),
  );
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

  it('gives components values of the types they are written as', async () => {
    const module = await compile(
      `::mark[Text]{#007 .x9 angle=35 offset=-0.5 label="35" flag=false step quoted="" at=30%,40%}\n\n:mark[Inline]{scale='2' size=2}`,
      {
        directives: { mark: { source: STUB_URL, exportName: 'Highlighter' } },
      },
    );
    const deck = renderDeck(module);
    const props = [deck.props.children]
      .flat()
      .map(renderSlideExport)
      .flatMap(function find(node: unknown): Record<string, unknown>[] {
        if (typeof node !== 'object' || node === null) {
          return [];
        }
        if (Array.isArray(node)) {
          return node.flatMap(find);
        }
        const { type, props: elementProps } = node as {
          type?: { name?: string };
          props?: Record<string, unknown>;
        };
        return [
          ...(type?.name === 'Highlighter' && elementProps !== undefined
            ? [elementProps]
            : []),
          ...find(elementProps?.['children']),
        ];
      })
      .map((found) =>
        Object.fromEntries(
          Object.entries(found).filter(([name]) => name !== 'children'),
        ),
      );
    expect(props).toEqual([
      {
        id: '007',
        className: 'x9',
        angle: 35,
        offset: -0.5,
        label: '35',
        flag: false,
        step: true,
        quoted: '',
        at: '30%,40%',
      },
      { scale: '2', size: 2 },
    ]);
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
        '<Highlighter gap=8><PluginCallout title="D"><Paragraph>Four</Paragraph></PluginCallout></Highlighter>',
    );
  });

  it('warns about wrappers without components', async () => {
    const file = await mdxCompile(':::column\nOne\n:::', {
      ...seminarMdxOptions({
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

  it('reads the forms and the content of directives', () => {
    const file = new VFile();
    expect(
      parseDirectiveComponents(
        {
          mark: {
            source: 'pkg',
            exportName: 'Mark',
            forms: ['text', 'text'],
            content: true,
          },
          box: { source: 'pkg', exportName: 'Box', forms: [], content: 'no' },
          bad: { source: 'pkg', exportName: 'Bad', forms: ['inline'] },
        },
        'the test config',
        file,
      ),
    ).toEqual({
      mark: {
        source: 'pkg',
        exportName: 'Mark',
        forms: ['text'],
        content: true,
      },
      box: { source: 'pkg', exportName: 'Box' },
      bad: { source: 'pkg', exportName: 'Bad' },
    });
    expect(file.messages.map(({ reason }) => reason)).toEqual([
      'Expected `forms` of the `box` directive in the test config to be a nonempty array of `text`, `leaf`, and `container`',
      'Expected `content` of the `box` directive in the test config to be a boolean',
      'Expected `forms` of the `bad` directive in the test config to be a nonempty array of `text`, `leaf`, and `container`',
    ]);
  });

  it('warns about directives in other forms, or with content they need or take not', async () => {
    const file = await mdxCompile(
      [
        ':mark[ok] ::mark[x] and :mark',
        '::mark[leaf]',
        ':::panel[Title]\n:::',
        ':::panel[Title]\nBody\n:::',
        ':rule ::rule and :rule[x]',
      ].join('\n\n'),
      {
        ...seminarMdxOptions({
          importSource: STUB_URL,
          directives: {
            mark: {
              source: STUB_URL,
              exportName: 'Highlighter',
              forms: ['text', 'container'],
              content: true,
            },
            panel: {
              source: STUB_URL,
              exportName: 'PluginCallout',
              labelProp: 'title',
              content: true,
            },
            rule: {
              source: STUB_URL,
              exportName: 'Highlighter',
              content: false,
            },
          },
        }),
      },
    );
    expect(file.messages.map(({ reason }) => reason)).toEqual([
      'The `:mark` directive needs content',
      "The `mark` directive can't be written as `::mark`; write `:mark` or `:::mark`",
      'The `:::panel` directive needs content',
      'The `:rule` directive takes no content',
    ]);
  });

  it('lets the theme override components registered by plugins', async () => {
    const importModule = vi.fn((): Promise<ImportedModule> =>
      Promise.resolve({
        module: {
          seminar: {
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
        seminarConfigs: [
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

  it('uses Seminar configs supplied by the integration', async () => {
    const module = await compile('::callout[From plugin]', {
      seminarConfigs: [
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
