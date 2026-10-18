import type { Element, ElementContent } from 'hast';
import { describe, expect, it } from 'vitest';

import { highlight } from './highlight.ts';

function textOf(node: ElementContent): string {
  if (node.type === 'text') {
    return node.value;
  }
  return 'children' in node ? node.children.map(textOf).join('') : '';
}

function colorsOf(node: ElementContent): string[] {
  if (node.type !== 'element') {
    return [];
  }
  const { style } = node.properties;
  return [
    ...(typeof style === 'string' ? [style] : []),
    ...node.children.flatMap(colorsOf),
  ];
}

async function highlighted(
  code: string,
  lang: string | undefined,
  options: Record<string, unknown> = {},
): Promise<Element> {
  const pre = await highlight({ code, lang }, options);
  if (pre === undefined) {
    throw new Error('Expected a highlighted block');
  }
  return pre;
}

describe('highlight', () => {
  it('highlights code in a pre element with the colors of the theme', async () => {
    const pre = await highlighted('const answer = 42;', 'ts');
    expect(pre.tagName).toBe('pre');
    expect(textOf(pre)).toBe('const answer = 42;');
    // Keywords and numbers are colored differently from the rest.
    expect(new Set(colorsOf(pre)).size).toBeGreaterThan(2);
  });

  it("doesn't make the code focusable", async () => {
    const pre = await highlighted('x', 'ts');
    expect(pre.properties).not.toHaveProperty('tabindex');
  });

  it('takes the theme from the options', async () => {
    const light = await highlighted('x = 1', 'python');
    const dark = await highlighted('x = 1', 'python', {
      theme: 'github-dark',
    });
    expect(colorsOf(dark)).not.toEqual(colorsOf(light));
  });

  it('shows plain text without a language', async () => {
    expect(textOf(await highlighted('just text', undefined))).toBe('just text');
    expect(textOf(await highlighted('just text', 'text'))).toBe('just text');
  });

  it('rejects unknown languages and themes', async () => {
    await expect(highlighted('x', 'no-such-language')).rejects.toThrow(
      'Unknown language no-such-language',
    );
    await expect(
      highlighted('x', 'ts', { theme: 'no-such-theme' }),
    ).rejects.toThrow('Unknown theme "no-such-theme"');
  });
});
