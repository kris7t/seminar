import { readFileSync } from 'node:fs';
import path from 'node:path';

import { compile } from '@mdx-js/mdx';
import { sliderMdxOptions, type ModuleImporter } from '@slider/mdx';
import { describe, expect, it } from 'vitest';

import { rehypeShiki } from './rehypeShiki.ts';

const { slider } = JSON.parse(
  readFileSync(path.join(import.meta.dirname, '../package.json'), 'utf8'),
) as { slider: unknown };

const importModule: ModuleImporter = (specifier) =>
  specifier === '@slider/plugin-shiki/rehype'
    ? Promise.resolve({ module: { rehypeShiki } })
    : Promise.reject(new Error(`Cannot find ${specifier}`));

const FIXTURES = path.join(import.meta.dirname, 'fixtures');

async function compileDeck(source: string, theme: unknown = {}) {
  const file = await compile(
    { value: source, path: path.join(FIXTURES, 'deck.mdx') },
    {
      ...sliderMdxOptions({
        defaultTheme: undefined,
        math: false,
        importModule,
        sliderConfigs: [
          {
            source: '@slider/plugin-shiki',
            base: '@slider/plugin-shiki',
            config: slider,
          },
          {
            source: 'theme',
            base: path.join(FIXTURES, 'theme.ts'),
            config: theme,
          },
        ],
      }),
    },
  );
  return { code: String(file), messages: file.messages.map((m) => m.reason) };
}

describe('rehypeShiki', () => {
  it('highlights code blocks in the Code component', async () => {
    const { code, messages } = await compileDeck('```ts\nconst x = 1;\n```');
    expect(messages).toEqual([]);
    expect(code).toContain(
      'import {Code as _SliderShikiCode} from "@slider/plugin-shiki";',
    );
    expect(code).toContain('lang: "ts"');
    expect(code).toContain('className: "shiki github-light"');
  });

  it('takes the theme from the options of the theme and the frontmatter', async () => {
    expect(
      (
        await compileDeck('```ts\nx\n```', {
          options: { code: { theme: 'github-dark' } },
        })
      ).code,
    ).toContain('className: "shiki github-dark"');
    expect(
      (
        await compileDeck(
          '---\ncode:\n  theme: min-light\n---\n\n```ts\nx\n```',
          {
            options: { code: { theme: 'github-dark' } },
          },
        )
      ).code,
    ).toContain('className: "shiki min-light"');
  });

  it('takes the attributes of steps in the first line', async () => {
    const { code } = await compileDeck(
      '```ts #fib .wide step group=impl {1|2}\nx\n```',
    );
    expect(code).toContain('meta: "{1|2}"');
    expect(code).toContain('id: "fib"');
    expect(code).toContain('className: "wide"');
    expect(code).toContain('group: "impl"');
  });

  it('reports code that it cannot highlight, and shows it as it is', async () => {
    const { code, messages } = await compileDeck('```nonsense\nx\n```');
    expect(messages).toEqual([
      expect.stringContaining('Unknown language nonsense') as unknown,
    ]);
    expect(code).toContain('className: "language-nonsense"');
  });

  it('loads languages and themes from the files of the theme', async () => {
    const { code, messages } = await compileDeck('```demo\nshout here\n```', {
      options: {
        code: {
          theme: 'Demo Theme',
          languages: ['./demo.tmLanguage.json'],
          themes: ['./demo-theme.json'],
        },
      },
    });
    expect(messages).toEqual([]);
    expect(code).toContain('className: "shiki Demo Theme"');
    expect(code).toContain('color: "#FF0000"');
  });

  it('loads languages with other names and aliases from the frontmatter', async () => {
    const { code, messages } = await compileDeck(
      '---\ncode:\n  languages:\n    - path: ./demo.tmLanguage.json\n      name: loud\n      aliases: [ld]\n---\n\n```ld\nshout\n```',
    );
    expect(messages).toEqual([]);
    expect(code).toContain('lang: "ld"');
    expect(code).toContain('color: "#D73A49"');
  });

  it('reports files that cannot be read', async () => {
    const { messages } = await compileDeck('```ts\nx\n```', {
      options: { code: { languages: ['./missing.json'] } },
    });
    expect(messages).toEqual([
      expect.stringContaining('Cannot read ./missing.json') as unknown,
    ]);
  });

  /** The number of colors in the code of a compiled deck. */
  function colorsOf(code: string): number {
    return new Set(code.match(/color: "#[0-9A-F]{6}"/gi)).size;
  }

  it('highlights the languages of Shiki that grammars embed', async () => {
    const { code, messages } = await compileDeck(
      '```template\nhi <% const answer = 42; %>\n```',
      { options: { code: { languages: ['./template.tmLanguage.json'] } } },
    );
    expect(messages).toEqual([]);
    // Keywords, names, and numbers of TypeScript besides the text.
    expect(colorsOf(code)).toBeGreaterThan(2);
  });

  it('keeps the languages of Shiki besides other languages', async () => {
    const { code, messages } = await compileDeck(
      '```ts\nconst answer = 42;\n```',
      { options: { code: { languages: ['./demo.tmLanguage.json'] } } },
    );
    expect(messages).toEqual([]);
    expect(colorsOf(code)).toBeGreaterThan(2);
  });

  it('lets grammars with the name of a language of Shiki replace it', async () => {
    const { code, messages } = await compileDeck('```ts\nshout\n```', {
      options: {
        code: { languages: [{ path: './demo.tmLanguage.json', name: 'ts' }] },
      },
    });
    expect(messages).toEqual([]);
    expect(code).toContain('color: "#D73A49"');
  });
});
