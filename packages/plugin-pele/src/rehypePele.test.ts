import { readFileSync } from 'node:fs';
import path from 'node:path';

import { compile } from '@mdx-js/mdx';
import { emptyMdxPlugins, seminarMdxOptions } from '@seminar/mdx';
import { rehypeShiki } from '@seminar/plugin-shiki/rehype';
import { describe, expect, it } from 'vitest';

import { rehypePele } from './rehypePele.ts';

const { seminar } = JSON.parse(
  readFileSync(path.join(import.meta.dirname, '../package.json'), 'utf8'),
) as { seminar: unknown };

async function compileDeck(
  source: string,
  after: [] | [typeof rehypeShiki] = [],
) {
  const file = await compile(
    { value: source, path: path.join(import.meta.dirname, 'deck.mdx') },
    {
      ...seminarMdxOptions({
        defaultTheme: undefined,
        mdxPlugins: {
          ...emptyMdxPlugins(),
          rehypePlugins: { before: [rehypePele], after },
        },
        seminarConfigs: [
          {
            source: '@seminar/plugin-pele',
            base: '@seminar/plugin-pele',
            config: seminar,
          },
        ],
      }),
    },
  );
  return {
    code: String(file),
    messages: file.messages.map(
      (m) => `${String(m.line)}:${String(m.column)} ${m.reason}`,
    ),
  };
}

const FLOWCHART = '```mermaid\nflowchart LR\n  A --> B\n```';

describe('rehypePele', () => {
  it('renders diagrams with the Diagram component', async () => {
    const { code, messages } = await compileDeck(FLOWCHART);
    expect(messages).toEqual([]);
    expect(code).toContain(
      'import {Diagram as _SeminarPeleDiagram} from "@seminar/plugin-pele";',
    );
    expect(code).toContain(
      'import _SeminarPele_flowchart from "pele/diagrams/flowchart";',
    );
    expect(code).toContain('source: "flowchart LR\\n  A --> B"');
    expect(code).toContain('diagrams: [_SeminarPele_flowchart]');
  });

  it('imports each type of diagram once', async () => {
    const { code } = await compileDeck(
      `${FLOWCHART}\n\n${FLOWCHART}\n\n\`\`\`mermaid\nsequenceDiagram\n  A->>B: hi\n\`\`\``,
    );
    expect(code.match(/import _SeminarPele_flowchart /g)).toHaveLength(1);
    expect(code).toContain(
      'import _SeminarPele_sequence from "pele/diagrams/sequence";',
    );
  });

  it('takes the attributes of steps after the language', async () => {
    const { code } = await compileDeck(
      '```mermaid #pipeline .wide step\nflowchart LR\n  A --> B\n```',
    );
    expect(code).toContain('id: "pipeline"');
    expect(code).toContain('className: "wide"');
    expect(code).toContain('step: ""');
  });

  it('reports diagrams that cannot be parsed where they fail, and keeps them as code', async () => {
    const { code, messages } = await compileDeck(
      '# Deck\n\n```mermaid\nflowchart LR\n  A -->\n```',
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatch(/^6:\d+ Cannot render diagram: .*Parse error/);
    expect(code).not.toContain('_SeminarPeleDiagram');
    expect(code).toContain('"language-mermaid"');
  });

  it('leaves other code blocks to syntax highlighting', async () => {
    const { code } = await compileDeck(
      `${FLOWCHART}\n\n\`\`\`ts\nconst x = 1;\n\`\`\``,
      [rehypeShiki],
    );
    expect(code).toContain('diagrams: [_SeminarPele_flowchart]');
    expect(code.match(/_SeminarShikiCode, \{/g)).toHaveLength(1);
  });
});
