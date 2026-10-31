import { readFileSync } from 'node:fs';

import mermaid from '@shikijs/langs/mermaid';
import * as oniguruma from 'vscode-oniguruma';
import {
  INITIAL,
  parseRawGrammar,
  Registry,
  type IGrammar,
  type StateStack,
} from 'vscode-textmate';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  DECK_SCOPE,
  renderDeckGrammar,
  renderMermaidGrammar,
} from './grammar.ts';

const syntaxes = new URL('../syntaxes/', import.meta.url);
const MDX_GRAMMAR = readFileSync(
  new URL('source.mdx.tmLanguage', syntaxes),
  'utf8',
);

/** Stands in for the grammar of TeX that comes with the editor. */
const TEX = JSON.stringify({
  scopeName: 'text.tex',
  patterns: [],
  repository: {
    'math-content': {
      patterns: [{ match: '\\\\[A-Za-z]+', name: 'constant.math.tex' }],
    },
  },
});

/** Stands in for the grammar of JSX, which expressions and JSX include. */
const TSX = JSON.stringify({
  scopeName: 'source.tsx',
  patterns: [],
  repository: { expression: { patterns: [] } },
});

const FILES: Record<string, string> = {
  'source.seminar-deck.injection': 'deck.injection.tmLanguage.json',
  'source.seminar-deck.heading': 'deck.heading.tmLanguage.json',
  'source.seminar-deck.steps': 'deck.steps.tmLanguage.json',
};

let grammar: IGrammar;

beforeAll(async () => {
  const wasm = readFileSync(
    new URL(import.meta.resolve('vscode-oniguruma/release/onig.wasm')),
  );
  await oniguruma.loadWASM(
    wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength),
  );
  const registry = new Registry({
    onigLib: Promise.resolve({
      createOnigScanner: (patterns) => new oniguruma.OnigScanner(patterns),
      createOnigString: (text) => new oniguruma.OnigString(text),
    }),
    loadGrammar: (scope) => {
      if (scope === 'text.tex') {
        return Promise.resolve(parseRawGrammar(TEX, 'tex.json'));
      }
      if (scope === DECK_SCOPE) {
        return Promise.resolve(
          parseRawGrammar(renderDeckGrammar(MDX_GRAMMAR), 'deck.tmLanguage'),
        );
      }
      if (scope === `${DECK_SCOPE}.mermaid`) {
        return Promise.resolve(
          parseRawGrammar(
            JSON.stringify(renderMermaidGrammar(mermaid[0] as never)),
            'mermaid.json',
          ),
        );
      }
      if (scope === 'source.tsx') {
        return Promise.resolve(parseRawGrammar(TSX, 'tsx.json'));
      }
      const file = FILES[scope];
      if (file === undefined) {
        return Promise.resolve(null);
      }
      return Promise.resolve(
        parseRawGrammar(readFileSync(new URL(file, syntaxes), 'utf8'), file),
      );
    },
    getInjections: (scope) =>
      scope === 'source.seminar-deck'
        ? [
            'source.seminar-deck.injection',
            'source.seminar-deck.heading',
            'source.seminar-deck.steps',
          ]
        : undefined,
  });
  const loaded = await registry.loadGrammar('source.seminar-deck');
  if (loaded === null) {
    throw new Error('The grammar of decks is missing.');
  }
  grammar = loaded;
});

/** Returns the text and scopes of the tokens with any `.seminar` scope or TeX. */
function tokenize(text: string): [string, string][] {
  const tokens: [string, string][] = [];
  let state: StateStack = INITIAL;
  for (const line of text.split('\n')) {
    const { tokens: lineTokens, ruleStack } = grammar.tokenizeLine(line, state);
    state = ruleStack;
    for (const { startIndex, endIndex, scopes } of lineTokens) {
      const scope = scopes
        .filter((name) =>
          /\.seminar$|\.tex$|\.latex$|^keyword\.control\.mermaid$/.test(name),
        )
        .at(-1);
      if (scope !== undefined) {
        tokens.push([line.slice(startIndex, endIndex), scope]);
      }
    }
  }
  return tokens;
}

describe('renderDeckGrammar', () => {
  it('replaces the scope of MDX', () => {
    const rendered = renderDeckGrammar(MDX_GRAMMAR);
    expect(rendered).not.toContain('<string>source.mdx</string>');
    expect(rendered).toContain(`<string>${DECK_SCOPE}</string>`);
  });

  it('leaves no code fence without props', () => {
    const rendered = renderDeckGrammar(MDX_GRAMMAR);
    const fences = rendered.match(
      /<string>\(\?:\^\|\\G\)\[\\t \]\*\((?:`|~)\{3,\}\)/g,
    );
    const props = rendered.match(/#code-fence-props/g);
    expect(props?.length).toBeGreaterThan(0);
    expect(props?.length).toBe(fences?.length);
  });

  it('fails if the grammar has no code fences', () => {
    expect(() => renderDeckGrammar('<plist></plist>')).toThrow(
      'no code fences',
    );
  });
});

describe('the grammar of decks', () => {
  it('highlights text directives with labels and attributes', () => {
    expect(tokenize('Hi :term[a word]{#id .wide k="v" bare} there')).toEqual([
      [':', 'string.other.begin.directive.seminar'],
      ['term', 'entity.name.tag.directive.seminar'],
      ['[', 'punctuation.definition.label.begin.seminar'],
      ['a word', 'meta.label.directive.seminar'],
      [']', 'punctuation.definition.label.end.seminar'],
      ['{', 'punctuation.definition.attributes.begin.seminar'],
      ['#id', 'entity.other.attribute-name.id.seminar'],
      [' ', 'meta.attributes.seminar'],
      ['.wide', 'entity.other.attribute-name.class.seminar'],
      [' ', 'meta.attributes.seminar'],
      ['k', 'entity.other.attribute-name.seminar'],
      ['=', 'punctuation.separator.key-value.seminar'],
      ['"v"', 'string.unquoted.attribute-value.seminar'],
      [' ', 'meta.attributes.seminar'],
      ['bare', 'entity.other.attribute-name.seminar'],
      ['}', 'punctuation.definition.attributes.end.seminar'],
    ]);
  });

  it('highlights directives with labels or attributes right after words', () => {
    expect(tokenize('appears:term[x]')).toEqual([
      [':', 'string.other.begin.directive.seminar'],
      ['term', 'entity.name.tag.directive.seminar'],
      ['[', 'punctuation.definition.label.begin.seminar'],
      ['x', 'meta.label.directive.seminar'],
      [']', 'punctuation.definition.label.end.seminar'],
    ]);
    expect(tokenize('step:term{#id}')).toEqual([
      [':', 'string.other.begin.directive.seminar'],
      ['term', 'entity.name.tag.directive.seminar'],
      ['{', 'punctuation.definition.attributes.begin.seminar'],
      ['#id', 'entity.other.attribute-name.id.seminar'],
      ['}', 'punctuation.definition.attributes.end.seminar'],
    ]);
  });

  it('highlights leaf and container directives', () => {
    expect(tokenize(':::notes\nText\n:::\n\n::callout[Title]')).toEqual([
      [':::', 'string.other.begin.directive.seminar'],
      ['notes', 'entity.name.type.notes.seminar'],
      ['Text', 'comment.notes.seminar'],
      [':::', 'string.other.end.directive.seminar'],
      ['::', 'string.other.begin.directive.seminar'],
      ['callout', 'entity.name.tag.directive.seminar'],
      ['[', 'punctuation.definition.label.begin.seminar'],
      ['Title', 'meta.label.directive.seminar'],
      [']', 'punctuation.definition.label.end.seminar'],
    ]);
  });

  it.each(['::include[./other.deck.mdx]', '::recap[#overview]'])(
    'highlights %s like imports',
    (text) => {
      expect(tokenize(text)[1]).toEqual([
        text.slice(2, text.indexOf('[')),
        'keyword.control.import.seminar',
      ]);
    },
  );

  it('gives the name of ::slide the scopes of the text of headings', () => {
    const { tokens } = grammar.tokenizeLine('::slide', INITIAL);
    expect(tokens[1]?.scopes).toEqual(
      expect.arrayContaining([
        'markup.heading.slide.seminar',
        'entity.name.section.slide.seminar',
      ]),
    );
  });

  it('highlights the name of ::slide like headings', () => {
    expect(tokenize('::slide[A title]{#id}')).toEqual([
      ['::', 'string.other.begin.directive.seminar'],
      ['slide', 'entity.name.section.slide.seminar'],
      ['[', 'punctuation.definition.label.begin.seminar'],
      ['A title', 'meta.label.directive.seminar'],
      [']', 'punctuation.definition.label.end.seminar'],
      ['{', 'punctuation.definition.attributes.begin.seminar'],
      ['#id', 'entity.other.attribute-name.id.seminar'],
      ['}', 'punctuation.definition.attributes.end.seminar'],
    ]);
  });

  it('highlights the unstyled text of notes like comments', () => {
    expect(
      tokenize(':::notes\nSome text and :step\nText\n:::\n\nAfter'),
    ).toEqual([
      [':::', 'string.other.begin.directive.seminar'],
      ['notes', 'entity.name.type.notes.seminar'],
      ['Some text and ', 'comment.notes.seminar'],
      [':', 'string.other.begin.directive.seminar'],
      ['step', 'entity.name.function.step.seminar'],
      ['Text', 'comment.notes.seminar'],
      [':::', 'string.other.end.directive.seminar'],
    ]);
  });

  it('closes notes with fences that are long enough', () => {
    expect(
      tokenize('::::notes\nText\n:::\nMore\n:::::\n\nAfter').at(-1),
    ).toEqual([':::::', 'string.other.end.directive.seminar']);
  });

  it.each([
    ':include',
    ':recap',
    ':notes',
    '::notes',
    ':slide',
    '::slides',
    ':::slide',
    ':::recap',
    '::included',
  ])('highlights %s like other directives', (text) => {
    expect(
      tokenize(text).filter(
        ([, scope]) => scope === 'entity.name.tag.directive.seminar',
      ),
    ).toEqual([[text.replace(/^:+/, ''), 'entity.name.tag.directive.seminar']]);
  });

  it.each([':step', '::step', ':::step'])('highlights %s as a step', (text) => {
    expect(tokenize(text)[1]).toEqual([
      'step',
      'entity.name.function.step.seminar',
    ]);
  });

  it.each([
    [':::column{step}', 'step'],
    [':::column{step grow=2}', 'step'],
    [':callout[x]{.a step}', 'step'],
    ['![Alt](./a.svg){#id step}', 'step'],
    ['```ts #id step\n```', 'step'],
    ['```mermaid step\n```', 'step'],
  ])('highlights the step in the props of %s', (text, step) => {
    expect(tokenize(text)).toContainEqual([
      step,
      'entity.name.function.step.seminar',
    ]);
  });

  it.each([
    ':::column{#step .step group=step step=1 steps}',
    '```ts #step .step group=step step=1 steps\n```',
    '## A heading {step}',
    '::slide{step}',
    '::slide[Title]{#id step}',
  ])('leaves props that are not steps alone in %s', (text) => {
    expect(tokenize(text).map(([, scope]) => scope)).not.toContain(
      'entity.name.function.step.seminar',
    );
  });

  it('highlights steps in list items', () => {
    expect(tokenize('- :step Item')).toEqual([
      [':', 'string.other.begin.directive.seminar'],
      ['step', 'entity.name.function.step.seminar'],
    ]);
  });

  it.each([
    ['note:this', 'this'],
    ['10:30', '30'],
    ['mailto:me', 'me'],
    ['x:a-b', 'a-b'],
    ['x:a_b', 'a_b'],
    ['x:é', 'é'],
    ['x:1a', '1a'],
    ['x:a.b', 'a'],
    ['a:b:c', 'c'],
    ['(:a)', 'a'],
    [String.raw`x\\:a`, 'a'],
  ])('finds the directive in %s like the parser', (text, name) => {
    expect(
      tokenize(text).filter(
        ([, scope]) => scope === 'entity.name.tag.directive.seminar',
      ),
    ).toEqual([[name, 'entity.name.tag.directive.seminar']]);
  });

  it.each([
    String.raw`note\:this`,
    'https://example.com',
    'a::b',
    'a:::b',
    'x:step-',
    'x:step_',
  ])('finds no directive in %s like the parser', (text) => {
    expect(tokenize(text)).toEqual([]);
  });

  it('leaves directives in code alone', () => {
    expect(tokenize('A `:step` code\n\n```\n:step\n```')).toEqual([]);
  });

  it.each(['```', '~~~'])('highlights the props of code in %s', (fence) => {
    expect(
      tokenize(`${fence}text #fib .wide step group=impl {1-3|a} "a #b"
#not .props
${fence}`),
    ).toEqual([
      ['#fib', 'entity.other.attribute-name.id.seminar'],
      ['.wide', 'entity.other.attribute-name.class.seminar'],
      ['step', 'entity.name.function.step.seminar'],
      ['group', 'entity.other.attribute-name.seminar'],
      ['=', 'punctuation.separator.key-value.seminar'],
      ['impl', 'string.unquoted.attribute-value.seminar'],
    ]);
  });

  it('highlights Mermaid diagrams', () => {
    expect(tokenize('```mermaid\nflowchart LR\n```')).toContainEqual([
      'flowchart',
      'keyword.control.mermaid',
    ]);
    expect(tokenize('~~~Mermaid #id\nsequenceDiagram\n~~~')).toEqual(
      expect.arrayContaining([
        ['#id', 'entity.other.attribute-name.id.seminar'],
        ['sequenceDiagram', 'keyword.control.mermaid'],
      ]),
    );
  });

  it('highlights steps in Mermaid diagrams', () => {
    const lines = tokenize(`\`\`\`mermaid
flowchart LR
  %% step group=emit
  %% step[c, a->c] only
\`\`\``);
    expect(lines).toEqual(
      expect.arrayContaining([
        ['%%', 'string.other.begin.directive.seminar'],
        ['step', 'entity.name.function.step.seminar'],
        ['group', 'entity.other.attribute-name.seminar'],
        ['[', 'punctuation.definition.label.begin.seminar'],
        ['c', 'variable.other.step-item.seminar'],
        ['a', 'variable.other.step-item.seminar'],
        ['->', 'keyword.operator.step-item.seminar'],
        ['only', 'entity.other.attribute-name.seminar'],
      ]),
    );
  });

  it('highlights steps in diagrams it does not know', () => {
    expect(tokenize('```mermaid\nwardley\n%% step\n```')).toEqual([
      ['%%', 'string.other.begin.directive.seminar'],
      ['step', 'entity.name.function.step.seminar'],
    ]);
  });

  it('leaves other comments in Mermaid diagrams alone', () => {
    expect(
      tokenize('```mermaid\nflowchart LR\n%% stepper\n%% a step\n```').filter(
        ([, scope]) => scope.endsWith('.seminar'),
      ),
    ).toEqual([]);
  });

  it('continues with Markdown after Mermaid diagrams', () => {
    expect(tokenize('```mermaid\nflowchart LR\n```\n\n:step')).toEqual(
      expect.arrayContaining([['step', 'entity.name.function.step.seminar']]),
    );
    expect(tokenize('```mermaid\nwardley\n```\n\n:step')).toEqual(
      expect.arrayContaining([['step', 'entity.name.function.step.seminar']]),
    );
  });

  it('leaves words that are not props alone after code fences', () => {
    expect(tokenize('```ts x.y #a.b\n```')).toEqual([]);
  });

  it('highlights attribute blocks of headings', () => {
    expect(tokenize('## Title {#id .wide}')).toEqual([
      ['{', 'punctuation.definition.attributes.begin.seminar'],
      ['#id', 'entity.other.attribute-name.id.seminar'],
      [' ', 'meta.attributes.seminar'],
      ['.wide', 'entity.other.attribute-name.class.seminar'],
      ['}', 'punctuation.definition.attributes.end.seminar'],
    ]);
  });

  it('leaves expressions in headings to MDX', () => {
    expect(tokenize('## Total {String(count)}')).toEqual([]);
    expect(tokenize('Text {#id}')).toEqual([]);
  });

  it('highlights attribute blocks of images only', () => {
    expect(tokenize('![Alt](./a.svg){#arch width=600}')).toEqual([
      ['{', 'punctuation.definition.attributes.begin.seminar'],
      ['#arch', 'entity.other.attribute-name.id.seminar'],
      [' ', 'meta.attributes.seminar'],
      ['width', 'entity.other.attribute-name.seminar'],
      ['=', 'punctuation.separator.key-value.seminar'],
      ['600', 'string.unquoted.attribute-value.seminar'],
      ['}', 'punctuation.definition.attributes.end.seminar'],
    ]);
    expect(tokenize('(in parentheses){value}')).toEqual([]);
  });

  it('highlights inline math with TeX', () => {
    expect(tokenize(String.raw`A $\pi^{2}$ b`)).toEqual([
      ['$', 'string.other.begin.math.seminar'],
      ['\\pi', 'constant.math.tex'],
      ['^{2}', 'meta.embedded.math.seminar'],
      ['$', 'string.other.end.math.seminar'],
    ]);
  });

  it('highlights math blocks with TeX', () => {
    expect(
      tokenize(String.raw`$$
\frac{1}{#x}
$$`),
    ).toEqual([
      ['$$', 'string.other.begin.math.seminar'],
      ['\\frac', 'constant.math.tex'],
      ['{1}{#x}', 'meta.embedded.math.seminar'],
      ['$$', 'string.other.end.math.seminar'],
    ]);
  });

  it('highlights environments in math', () => {
    expect(
      tokenize(String.raw`$$
\begin{equation}
\end{equation}
$$`),
    ).toEqual([
      ['$$', 'string.other.begin.math.seminar'],
      ['\\', 'punctuation.definition.function.latex'],
      ['begin', 'support.function.be.latex'],
      ['{', 'punctuation.definition.arguments.begin.latex'],
      ['equation', 'variable.parameter.function.latex'],
      ['}', 'punctuation.definition.arguments.end.latex'],
      ['\\', 'punctuation.definition.function.latex'],
      ['end', 'support.function.be.latex'],
      ['{', 'punctuation.definition.arguments.begin.latex'],
      ['equation', 'variable.parameter.function.latex'],
      ['}', 'punctuation.definition.arguments.end.latex'],
      ['$$', 'string.other.end.math.seminar'],
    ]);
  });

  it('leaves dollars that are not math alone', () => {
    expect(tokenize(String.raw`Costs \$5 and $x with no end`)).toEqual([]);
    expect(tokenize('A `$x$` code')).toEqual([]);
    expect(tokenize('{a$b$c}')).toEqual([]);
  });
});
