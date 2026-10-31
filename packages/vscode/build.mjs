// Bundles the extension and its language server, since VSIX packages don't
// include `node_modules`.
import { copyFile } from 'node:fs/promises';
import { build } from 'esbuild';

await copyFile(
  new URL('../../LICENSE', import.meta.url),
  new URL('./LICENSE', import.meta.url),
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
