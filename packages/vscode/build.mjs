// Bundles the extension and its language server, since VSIX packages don't
// include `node_modules`.
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import mermaid from '@shikijs/langs/mermaid';
import { build } from 'esbuild';

import { renderDeckGrammar, renderMermaidGrammar } from './src/grammar.ts';

await copyFile(
  new URL('../../LICENSE', import.meta.url),
  new URL('./LICENSE', import.meta.url),
);

await mkdir(new URL('./dist/', import.meta.url), { recursive: true });
await writeFile(
  new URL('./dist/deck.tmLanguage', import.meta.url),
  renderDeckGrammar(
    await readFile(
      new URL('./syntaxes/source.mdx.tmLanguage', import.meta.url),
      'utf8',
    ),
  ),
);
await writeFile(
  new URL('./dist/deck.mermaid.tmLanguage.json', import.meta.url),
  JSON.stringify(renderMermaidGrammar(mermaid[0])),
);

await build({
  absWorkingDir: import.meta.dirname,
  entryPoints: { extension: 'src/extension.ts', server: 'src/server/index.ts' },
  outdir: 'dist',
  outExtension: { '.js': '.cjs' },
  bundle: true,
  minify: true,
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  conditions: ['@seminar/source', 'module'],
  mainFields: ['module', 'main'],
  external: ['vscode'],
  logLevel: 'warning',
});
