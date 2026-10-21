import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

/** Optional plugins offered by the initializer. */
export type Plugin = 'elements' | 'mathjax' | 'shiki';
/** Whether to use the packaged theme or generate an editable theme. */
export type Theme = 'default' | 'custom';
/** The choices needed to create a presentation project. */
export interface ProjectOptions {
  directory: string;
  plugins: readonly Plugin[];
  theme: Theme;
}

/** Plugin names and packages, in the order shown in the prompt. */
export const PLUGINS: readonly {
  value: Plugin;
  title: string;
  package: string;
}[] = [
  {
    value: 'elements',
    title: 'Elements — callouts and columns',
    package: '@seminar/elements',
  },
  {
    value: 'mathjax',
    title: 'MathJax — math formulas',
    package: '@seminar/plugin-mathjax',
  },
  {
    value: 'shiki',
    title: 'Shiki — syntax highlighting',
    package: '@seminar/plugin-shiki',
  },
];

interface Package {
  version: string;
  devDependencies: Record<string, string>;
}
const pkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as Package;
/** The release version used for generated Seminar dependencies. */
export const VERSION: string = pkg.version;

function dependencies(names: string[]): Record<string, string> {
  return Object.fromEntries(
    names.sort().map((name) => {
      const version = pkg.devDependencies[name];
      if (version === undefined)
        throw new Error(`Missing starter dependency: ${name}`);
      return [name, version];
    }),
  );
}

function packageName(directory: string): string {
  const name = path
    .basename(directory)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[._-]+/, '')
    .slice(0, 214);
  return name === '' || name === 'node_modules' || name === 'favicon.ico'
    ? 'seminar-deck'
    : name;
}

function deck({ plugins }: ProjectOptions): string {
  return `# My talk

A presentation made with Seminar

### One idea at a time

- Start with the question
- :step Show the evidence
- :step Make the connection
${
  plugins.includes('elements')
    ? `
### Side by side

:::columns
::column[The question]
What do we want to understand?

::column[The evidence]
What have we learned?
:::
`
    : ''
}${
    plugins.includes('mathjax')
      ? `
### A little math

Euler's identity: $e^{i\\pi} + 1 = 0$.
`
      : ''
  }${
    plugins.includes('shiki')
      ? `
### Show your work

\`\`\`ts
const answer = 42;
console.log(answer);
\`\`\`
`
      : ''
  }`;
}

const customTheme = `import '@fontsource/roboto/300.css';
import '@fontsource/roboto/300-italic.css';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/400-italic.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/500-italic.css';
import '@fontsource/roboto/700.css';
import '@fontsource/roboto/700-italic.css';

import { createSlideTheme } from '@seminar/core';

export default createSlideTheme({
  palette: { primary: { main: '#00639b' } },
});
`;

/** Creates a project in a new or empty directory, preserving Git metadata. */
export function createProject(options: ProjectOptions): void {
  const directory = path.resolve(options.directory);
  if (existsSync(directory)) {
    if (!lstatSync(directory).isDirectory())
      throw new Error(`Destination must be a directory: ${directory}`);
    if (readdirSync(directory).some((name) => name !== '.git'))
      throw new Error(`Destination is not empty: ${directory}`);
  }
  const selected = PLUGINS.filter(({ value }) =>
    options.plugins.includes(value),
  );
  const manifest = {
    name: packageName(directory),
    version: '0.0.0',
    private: true,
    type: 'module',
    engines: { node: '>=24' },
    scripts: {
      dev: 'vite',
      build: 'tsc --noEmit && vite build',
      preview: 'vite preview',
      typecheck: 'tsc --noEmit',
    },
    dependencies: dependencies([
      '@seminar/core',
      'react',
      'react-dom',
      '@mui/material',
      '@emotion/react',
      '@emotion/styled',
      ...selected.map((plugin) => plugin.package),
      options.theme === 'custom'
        ? '@fontsource/roboto'
        : '@seminar/theme-default',
    ]),
    devDependencies: dependencies([
      '@seminar/mdx',
      '@seminar/vite-plugin',
      '@vitejs/plugin-react',
      'vite',
      'typescript',
      '@types/node',
      '@types/react',
      '@types/react-dom',
    ]),
  };
  const seminarOptions = [
    ...(options.theme === 'custom'
      ? ["      defaultTheme: '@/theme.ts',"]
      : []),
    ...(selected.length === 0
      ? []
      : [
          `      plugins: [\n${selected.map((plugin) => `        '${plugin.package}',`).join('\n')}\n      ],`,
        ]),
  ];
  const config = `import { fileURLToPath } from 'node:url';
import seminar from '@seminar/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'decks',
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  plugins: [
    ${
      seminarOptions.length === 0
        ? 'seminar()'
        : `seminar({
${seminarOptions.join('\n')}
    })`
    },
    react(),
  ],
  build: { outDir: '../dist', emptyOutDir: true },
});
`;
  const tsconfig = {
    compilerOptions: {
      target: 'ES2024',
      lib: ['ES2024', 'DOM', 'DOM.Iterable'],
      module: 'ESNext',
      moduleResolution: 'Bundler',
      jsx: 'react-jsx',
      strict: true,
      noEmit: true,
      allowImportingTsExtensions: true,
      resolveJsonModule: true,
      types: ['node', 'vite/client', '@seminar/mdx/client'],
      paths: { '@/*': ['./src/*'] },
    },
    include: ['**/*.ts', '**/*.tsx'],
  };
  const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
  const files: Record<string, string> = {
    'package.json': json(manifest),
    'vite.config.ts': config,
    'tsconfig.json': json(tsconfig),
    'decks/index.deck.mdx': deck(options),
    '.gitignore': 'node_modules/\ndist/\n*.tsbuildinfo\n',
    'README.md': `# ${manifest.name}

Requires Node.js 24 or newer.

\`\`\`sh
npm install
npm run dev
\`\`\`

Edit \`decks/index.deck.mdx\` while the development server is running.
Imports such as \`@/MyComponent\` resolve to \`src/MyComponent\` in Vite and TypeScript.
${options.theme === 'custom' ? '\nEdit `src/theme.ts` to customize the theme and fonts. The Vite configuration selects it as the default theme for every deck.\n' : ''}
Run \`npm run build\` to create \`dist/index.html\`, a self-contained presentation
that you can open in a browser or share. Run \`npm run preview\` to preview the build.

[Seminar documentation](https://seminar.run)
`,
    ...(options.theme === 'custom' ? { 'src/theme.ts': customTheme } : {}),
  };
  mkdirSync(directory, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(directory, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content, { flag: 'wx' });
  }
}
