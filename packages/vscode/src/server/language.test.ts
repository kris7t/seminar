import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { createDeckLanguagePlugin, DECK_LANGUAGE } from './language.ts';

const DECK = `---
theme: x
---

import { value } from './value.ts';

## First {#first .wide}

:step Some {value.alpha} text, and $e^{i\\pi}$

:::notes
Notes {value.beta}
:::

![Image](./a.svg){#image}

<Foo bar={value.gamma} />
`;

const directory = mkdtempSync(path.join(tmpdir(), 'seminar-vscode-'));
const withPlugin = path.join(directory, 'with');
const withoutPlugin = path.join(directory, 'without');
mkdirSync(path.join(withPlugin, 'node_modules/@seminar/plugin-mathjax'), {
  recursive: true,
});
writeFileSync(
  path.join(withPlugin, 'node_modules/@seminar/plugin-mathjax/package.json'),
  '{}',
);
mkdirSync(withoutPlugin);

afterAll(() => {
  rmSync(directory, { recursive: true });
});

function generate(file: string, source: string) {
  const plugin = createDeckLanguagePlugin();
  const code = plugin.createVirtualCode?.(
    file,
    plugin.getLanguageId(file) ?? '',
    {
      getText: (start, end) => source.slice(start, end),
      getLength: () => source.length,
      getChangeRange: () => undefined,
    },
    undefined as never,
  ) as
    | {
        error?: { message: string };
        embeddedCodes?: {
          id: string;
          snapshot: { getText: (start: number, end: number) => string };
          mappings: { sourceOffsets: number[]; lengths: number[] }[];
        }[];
      }
    | undefined;
  return code;
}

describe('createDeckLanguagePlugin', () => {
  const file = path.join(withPlugin, 'talk.deck.mdx');

  it('only takes decks', () => {
    const plugin = createDeckLanguagePlugin();
    expect(plugin.getLanguageId(file)).toBe(DECK_LANGUAGE);
    expect(
      plugin.getLanguageId(path.join(withPlugin, 'a.mdx')),
    ).toBeUndefined();
  });

  it('parses the syntax of decks', () => {
    expect(generate(file, DECK)?.error).toBeUndefined();
  });

  it('maps the code of decks back to their source', () => {
    const mapped = generate(file, DECK)
      ?.embeddedCodes?.find(({ id }) => id === 'jsx')
      ?.mappings.flatMap(({ sourceOffsets, lengths }) =>
        sourceOffsets.map((offset, index) =>
          DECK.slice(offset, offset + (lengths[index] ?? 0)),
        ),
      );
    expect(mapped).toEqual(
      expect.arrayContaining([
        "import { value } from './value.ts';\n",
        '{value.alpha}',
        '{value.beta}',
        'Foo bar={value.gamma} />',
      ]),
    );
  });

  it('leaves the frontmatter out of the outline', () => {
    const source = '---\ntheme: x\n---\n\n## First\n';
    const markdown = generate(file, source)?.embeddedCodes?.find(
      ({ id }) => id === 'md',
    );
    expect(markdown?.snapshot.getText(0, source.length)).toBe(
      '   \n        \n   \n\n## First\n',
    );
  });

  it('keeps thematic breaks that are not frontmatter', () => {
    const source = 'Text\n\n---\n\nTitle\n\n---\n';
    const markdown = generate(file, source)?.embeddedCodes?.find(
      ({ id }) => id === 'md',
    );
    expect(markdown?.snapshot.getText(0, source.length)).toBe(source);
  });

  it('only parses math if the plugin that adds it is installed', () => {
    const source = String.raw`A $\frac{1}{#x}$ b`;
    expect(generate(file, source)?.error).toBeUndefined();
    expect(
      generate(path.join(withoutPlugin, 'talk.deck.mdx'), source)?.error
        ?.message,
    ).toContain('Could not parse expression');
  });
});
