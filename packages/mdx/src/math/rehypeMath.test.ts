import { compile } from '@mdx-js/mdx';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sliderMdxOptions, type SliderMdxOptions } from '../options.ts';
import { withThemeConfig } from '../test/compileDeck.ts';

const DECK_PATH = fileURLToPath(
  new URL('../test/test.deck.mdx', import.meta.url),
);

async function compileDeck(
  source: string,
  options?: SliderMdxOptions,
  deckPath = DECK_PATH,
) {
  const file = await compile(
    { value: source, path: deckPath },
    sliderMdxOptions(await withThemeConfig(source, deckPath, options)),
  );
  return { code: String(file), messages: file.messages.map(String) };
}

/** Returns the MathML of the formulas in the compiled code. */
function mathml(code: string): string[] {
  return [...code.matchAll(/mathml: ("(?:[^"\\]|\\.)*")/g)].map(
    ([, value]) => JSON.parse(value ?? '""') as string,
  );
}

/** Returns the font of the glyphs in the compiled code, e.g., `NCM`. */
function fonts(code: string): string[] {
  return [...new Set(code.match(/(?<=id: "MJX-\d+-)[A-Z]+/g))];
}

describe('rehypeMath', () => {
  it('renders inline and display math', async () => {
    const { code, messages } = await compileDeck(
      '## Math\n\nInline $x^{2}$\n\n$$\n\\int \\pi\n$$',
    );
    expect(messages).toEqual([]);
    expect(code).toContain('Formula as _SliderFormula');
    expect(
      code.match(/_jsxs?\(_SliderFormula, \{\s*(display: true)?/g),
    ).toEqual([
      expect.not.stringContaining('display'),
      expect.stringContaining('display: true'),
    ]);
    // The SVG is hidden from assistive technology, which reads the MathML.
    expect(code).toContain('"aria-hidden": "true"');
    const [inline, display] = mathml(code);
    expect(inline).toMatch(/^<math [^>]*data-latex="x\^\{2\}"/);
    // Non-ASCII characters are character references, so that self-contained
    // builds don't keep fonts for them.
    expect(display).toContain('&#x3C0;');
    expect(display).not.toMatch(/[\u0080-\u{10FFFF}]/u);
    expect(fonts(code)).toEqual(['NCM']);
  });

  it('numbers equations and resolves references', async () => {
    const { code } = await compileDeck(
      '$$\n\\begin{equation}a \\label{a}\\end{equation}\n$$\n\n$$\n\\begin{equation}b\\end{equation}\n$$\n\nSee $\\eqref{a}$',
    );
    expect(code).toContain('fullWidth: true');
    // The labels of the equations, then the reference.
    expect(
      mathml(code).map((math) =>
        [...math.matchAll(/<mtext>(\(?\d\)?)<\/mtext>/g)].map(
          ([, text]) => text,
        ),
      ),
    ).toEqual([['1'], ['2'], ['(1)']]);
    // Links would navigate away from the slide.
    expect(code).not.toContain('_components.a,');
  });

  it('reports errors', async () => {
    const { messages } = await compileDeck('$\\frac{1}{\\nope}$');
    expect(messages).toEqual([
      expect.stringContaining(
        'Cannot render math: Undefined control sequence \\nope',
      ),
    ]);
  });

  describe('theme packages', () => {
    let directory: string;
    let deckPath: string;

    /** Creates a theme package that throws if it is imported. */
    async function createTheme(
      name: string,
      manifest: Record<string, unknown>,
      files: Record<string, unknown> = {},
    ) {
      const packageDirectory = path.join(directory, 'node_modules', name);
      await mkdir(packageDirectory, { recursive: true });
      await writeFile(
        path.join(packageDirectory, 'package.json'),
        JSON.stringify({ name, type: 'module', ...manifest }),
      );
      await writeFile(
        path.join(packageDirectory, 'index.js'),
        'throw new Error("Imported the theme");',
      );
      for (const [file, contents] of Object.entries(files)) {
        await writeFile(
          path.join(packageDirectory, file),
          JSON.stringify(contents),
        );
      }
    }

    beforeAll(async () => {
      directory = await mkdtemp(path.join(tmpdir(), 'slider-themes-'));
      deckPath = path.join(directory, 'talk.deck.mdx');
      const fira = { math: { font: 'fira' } };
      await createTheme(
        'condition-theme',
        {
          exports: { '.': { slider: './slider.json', default: './index.js' } },
          // Ignored in favor of the export condition.
          slider: { math: { font: 'missing' } },
        },
        { 'slider.json': fira },
      );
      await createTheme('key-theme', {
        exports: { '.': './index.js' },
        slider: fira,
      });
    });

    afterAll(async () => {
      await rm(directory, { recursive: true, force: true });
    });

    it.each(['condition-theme', 'key-theme', '@slider/theme-default'])(
      'reads the config of %s without importing it',
      async (theme) => {
        const { code, messages } = await compileDeck(
          `---\ntheme: "${theme}"\n---\n\n$x$`,
          {},
          theme.startsWith('@') ? DECK_PATH : deckPath,
        );
        expect(messages).toEqual([]);
        expect(fonts(code)).toEqual(['FIRA']);
      },
    );
  });

  it('uses the slider export of other themes', async () => {
    const { code, messages } = await compileDeck(
      '---\ntheme: ./theme.ts\n---\n\n$\\R \\T$',
    );
    expect(messages).toEqual([]);
    expect(fonts(code)).toEqual(['FIRA']);
    expect(mathml(code)[0]).toContain('data-latex="\\R \\T"');
  });

  it('overrides the theme with the frontmatter', async () => {
    const { code } = await compileDeck(
      `---\ntheme: ./theme.ts\nmath:\n  font: newcm\n  macros:\n    T: \\text{deck}\n---\n\n$\\R \\T$`,
    );
    expect(fonts(code)).toEqual(['NCM']);
    expect(mathml(code)[0]).toContain('<mtext>deck</mtext>');
  });

  it('reports invalid options', async () => {
    const { messages } = await compileDeck(
      '---\nmath:\n  font: 1\n  tags: some\n  macros:\n    x: [1]\n---\n\n$x$',
    );
    expect(messages).toEqual([
      expect.stringContaining('Expected `math.font` in the frontmatter'),
      expect.stringContaining('Expected the macro `x` in the frontmatter'),
      expect.stringContaining('Expected `math.tags` in the frontmatter'),
    ]);
  });

  it('fails for missing fonts', async () => {
    await expect(
      compileDeck('---\nmath:\n  font: missing\n---\n\n$x$'),
    ).rejects.toThrow(
      'Cannot find the MathJax font package @mathjax/mathjax-missing-font',
    );
  });

  it('can be disabled', async () => {
    const { code } = await compileDeck('Costs $5 or $6', { math: false });
    expect(code).not.toContain('_jsx(_SliderFormula');
    expect(code).toContain('Costs $5 or $6');
  });
});
