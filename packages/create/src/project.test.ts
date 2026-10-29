import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { run as runCli, type RunOptions } from './cli.ts';
import { createProject, VERSION, type Plugin } from './project.ts';

const temporary: string[] = [];
const run = (argv: string[], options: RunOptions = {}) =>
  runCli(argv, {
    installDependencies: vi.fn(() => Promise.resolve()),
    ...options,
  });
function workspace() {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'create-seminar-test-'));
  temporary.push(directory);
  return directory;
}
afterEach(() => {
  vi.unstubAllEnvs();
  for (const directory of temporary.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
const plugins: Plugin[] = ['elements', 'mathjax', 'pele', 'shiki'];
const packages: Record<Plugin, string> = {
  elements: '@seminar/elements',
  mathjax: '@seminar/plugin-mathjax',
  pele: '@seminar/plugin-pele',
  shiki: '@seminar/plugin-shiki',
};
const read = (directory: string, file: string) =>
  readFileSync(path.join(directory, file), 'utf8');
interface Manifest {
  name: string;
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

for (let mask = 0; mask < 1 << plugins.length; mask++) {
  const selected = plugins.filter((_, index) => (mask & (1 << index)) !== 0);
  for (const theme of ['default', 'custom'] as const) {
    it(`creates a ${theme} theme project with ${selected.join(', ') || 'no plugins'}`, () => {
      const directory = path.join(workspace(), 'my-talk');
      createProject({ directory, plugins: selected, theme });
      const manifest = JSON.parse(read(directory, 'package.json')) as Manifest;
      expect(manifest.name).toBe('my-talk');
      const config = read(directory, 'vite.config.ts');
      expect(config).toContain("root: 'decks'");
      expect(config).toContain(
        "'@': fileURLToPath(new URL('./src', import.meta.url))",
      );
      const tsconfig = JSON.parse(read(directory, 'tsconfig.json')) as {
        compilerOptions: { paths: Record<string, string[]> };
      };
      expect(tsconfig.compilerOptions.paths['@/*']).toEqual(['./src/*']);
      expect(config).toContain("outDir: '../dist'");
      expect(config).toContain('emptyOutDir: true');
      expect(config).toContain('selfContained: true');
      const deck = read(directory, 'decks/index.deck.mdx');
      expect(deck).toContain(':step');
      for (const plugin of plugins) {
        const name = packages[plugin];
        if (selected.includes(plugin)) {
          expect(manifest.dependencies[name]).toBe(VERSION);
          expect(config).toContain(name);
        } else {
          expect(manifest.dependencies).not.toHaveProperty(name);
          expect(config).not.toContain(name);
        }
      }
      expect(deck.includes(':::column[')).toBe(selected.includes('elements'));
      expect(deck.includes('$')).toBe(selected.includes('mathjax'));
      expect(deck.includes('```mermaid')).toBe(selected.includes('pele'));
      expect(deck.includes('```ts')).toBe(selected.includes('shiki'));
      expect(manifest.devDependencies).toHaveProperty('@seminar/mdx');
      expect(manifest.devDependencies).toHaveProperty('@seminar/vite-plugin');
      if (theme === 'custom') {
        expect(manifest.dependencies).toHaveProperty('@fontsource/roboto');
        expect(manifest.dependencies).not.toHaveProperty(
          '@seminar/theme-default',
        );
        expect(deck).not.toContain('theme:');
        expect(config).toContain("defaultTheme: '@/theme.ts'");
        const source = read(directory, 'src/theme.ts');
        expect(source).toContain('createSlideTheme');
        for (const weight of [300, 400, 500, 700]) {
          expect(source).toContain(`@fontsource/roboto/${String(weight)}.css`);
          expect(source).toContain(
            `@fontsource/roboto/${String(weight)}-italic.css`,
          );
        }
      } else {
        expect(manifest.dependencies).toHaveProperty('@seminar/theme-default');
        expect(manifest.dependencies).not.toHaveProperty('@fontsource/roboto');
        expect(existsSync(path.join(directory, 'src/theme.ts'))).toBe(false);
      }
    });
  }
}

it.each(['default', 'custom'] as const)(
  'can disable self-contained builds with the %s theme',
  (theme) => {
    const directory = path.join(workspace(), 'hosted-talk');
    createProject({ directory, plugins: [], theme, selfContained: false });
    expect(read(directory, 'vite.config.ts')).toContain('selfContained: false');
    const readme = read(directory, 'README.md');
    expect(readme).toContain('Deploy the whole `dist/` directory');
    expect(readme).not.toContain('a self-contained presentation');
  },
);

it('presents the deck with the command line', () => {
  const directory = path.join(workspace(), 'talk');
  createProject({ directory, plugins: [], theme: 'default', pdfs: [] });
  const manifest = JSON.parse(read(directory, 'package.json')) as Manifest;
  expect(manifest.scripts['present']).toBe('seminar present');
  expect(manifest.scripts['preview']).toBe('seminar preview');
  expect(manifest.devDependencies['@seminar/cli']).toBe(VERSION);
  expect(read(directory, 'README.md')).toContain(
    'Run `npm run present` to build the presentation and present it',
  );
  expect(read(directory, 'README.md')).toContain(
    'Run `npm run preview` to preview it in the same app instead',
  );
});

describe('PDFs', () => {
  it('saves PDFs of the slides by default', () => {
    const directory = path.join(workspace(), 'talk');
    createProject({ directory, plugins: [], theme: 'default' });
    const manifest = JSON.parse(read(directory, 'package.json')) as Manifest;
    expect(manifest.scripts['pdf']).toBe('npm run build && seminar pdf');
    expect(manifest.devDependencies['@seminar/cli']).toBe(VERSION);
    expect(read(directory, 'README.md')).toContain(
      'Run `npm run pdf` to build the presentation and save it as `dist/index.pdf`.',
    );
  });

  it.each([
    [['notes'], 'seminar pdf --layout notes', '`dist/index-notes.pdf`'],
    [
      ['6up', 'slides', '2up', 'notes'],
      'seminar pdf --layout slides,notes,grid --per-sheet 2,6',
      '`dist/index.pdf`, `dist/index-notes.pdf`, `dist/index-2up.pdf`, `dist/index-6up.pdf`',
    ],
  ] as const)('saves the PDFs chosen: %j', (pdfs, command, files) => {
    const directory = path.join(workspace(), 'talk');
    createProject({ directory, plugins: [], theme: 'default', pdfs });
    const manifest = JSON.parse(read(directory, 'package.json')) as Manifest;
    expect(manifest.scripts['pdf']).toBe(`npm run build && ${command}`);
    expect(read(directory, 'README.md')).toContain(`save it as ${files}.`);
  });

  it('leaves out the pdf script if no PDFs are chosen', () => {
    const directory = path.join(workspace(), 'talk');
    createProject({ directory, plugins: [], theme: 'default', pdfs: [] });
    const manifest = JSON.parse(read(directory, 'package.json')) as Manifest;
    expect(manifest.scripts).not.toHaveProperty('pdf');
    expect(read(directory, 'README.md')).not.toContain('npm run pdf');
  });
});

describe('existing destinations', () => {
  it('keeps existing files and refuses to create a project over them', () => {
    const directory = workspace();
    writeFileSync(path.join(directory, 'notes.txt'), 'Keep my notes');
    expect(() => {
      createProject({ directory, plugins: [], theme: 'default' });
    }).toThrow(/not empty/);
    expect(read(directory, 'notes.txt')).toBe('Keep my notes');
    expect(readdirSync(directory)).toEqual(['notes.txt']);
  });
  it('allows an empty directory or one containing only Git metadata', () => {
    for (const git of [false, true]) {
      const directory = workspace();
      if (git) mkdirSync(path.join(directory, '.git'));
      createProject({ directory, plugins: [], theme: 'default' });
      expect(read(directory, 'package.json')).toContain('"private": true');
      if (git) expect(readdirSync(directory)).toContain('.git');
    }
  });
  it('refuses symlinks and files as destinations', () => {
    const root = workspace();
    const directory = path.join(root, 'destination');
    symlinkSync(workspace(), directory, 'dir');
    expect(() => {
      createProject({ directory, plugins: [], theme: 'default' });
    }).toThrow(/directory/);
    rmSync(directory);
    writeFileSync(directory, 'existing file');
    expect(() => {
      createProject({ directory, plugins: [], theme: 'default' });
    }).toThrow(/directory/);
    expect(read(root, 'destination')).toBe('existing file');
  });
});

describe('CLI', () => {
  it('uses explicit flags without prompting, including paths with spaces', async () => {
    const cwd = workspace();
    const ask = vi.fn();
    const output = vi.fn();
    await run(
      [
        'My Talk',
        '--plugins',
        'mathjax,elements',
        '--theme',
        'custom',
        '--self-contained',
        '--pdf',
        'none',
        '--no-install',
      ],
      { cwd, interactive: true, ask, output },
    );
    expect(ask).not.toHaveBeenCalled();
    const manifest = JSON.parse(
      read(path.join(cwd, 'My Talk'), 'package.json'),
    ) as Manifest;
    expect(manifest.name).toBe('my-talk');
    expect(output.mock.calls.flat().join('\n')).toContain("cd 'My Talk'");
  });
  it('asks only for missing choices and accepts an empty plugin selection', async () => {
    const cwd = workspace();
    const ask = vi.fn((questions: { name?: unknown; initial?: unknown }[]) => {
      expect(questions.map(({ name }) => name)).toEqual([
        'plugins',
        'theme',
        'selfContained',
        'pdfs',
        'install',
      ]);
      expect(questions.at(-1)?.initial).toBe(true);
      return Promise.resolve({
        plugins: [],
        theme: 'custom',
        selfContained: false,
        pdfs: ['notes'],
        install: false,
      });
    });
    await run(['talk'], { cwd, interactive: true, ask, output: vi.fn() });
    expect(ask.mock.calls).toHaveLength(1);
    const manifest = JSON.parse(
      read(path.join(cwd, 'talk'), 'package.json'),
    ) as Manifest;
    expect(manifest.dependencies).not.toHaveProperty('@seminar/elements');
    expect(manifest.dependencies).toHaveProperty('@fontsource/roboto');
    expect(read(path.join(cwd, 'talk'), 'vite.config.ts')).toContain(
      'selfContained: false',
    );
    expect(manifest.scripts['pdf']).toBe(
      'npm run build && seminar pdf --layout notes',
    );
  });
  it('accepts the PDFs to save, or none', async () => {
    const cwd = workspace();
    const output = vi.fn();
    await run(['talk', '--yes', '--pdf', 'slides,4up'], {
      cwd,
      interactive: false,
      output,
    });
    expect(
      (JSON.parse(read(path.join(cwd, 'talk'), 'package.json')) as Manifest)
        .scripts['pdf'],
    ).toBe('npm run build && seminar pdf --layout slides,grid --per-sheet 4');
    expect(output.mock.calls.flat().join('\n')).toContain(
      'Run `npm run present` to present it with the presenter view.\nRun `npm run pdf` to save the presentation as PDF.',
    );
    output.mockClear();
    await run(['none', '--yes', '--pdf', 'none'], {
      cwd,
      interactive: false,
      output,
    });
    expect(
      (JSON.parse(read(path.join(cwd, 'none'), 'package.json')) as Manifest)
        .scripts,
    ).not.toHaveProperty('pdf');
    expect(output.mock.calls.flat().join('\n')).not.toContain('npm run pdf');
    expect(output.mock.calls.flat().join('\n')).toContain('npm run present');
    await expect(
      run(['other', '--yes', '--pdf', 'poster'], {
        cwd,
        interactive: false,
        output,
      }),
    ).rejects.toThrow('Unknown PDF "poster"');
  });
  it('uses defaults with --yes and lets explicit flags override them', async () => {
    const cwd = workspace();
    await run(['--yes'], { cwd, interactive: false, output: vi.fn() });
    const manifest = JSON.parse(
      read(path.join(cwd, 'my-talk'), 'package.json'),
    ) as Manifest;
    for (const name of Object.values(packages))
      expect(manifest.dependencies).toHaveProperty(name);
    expect(manifest.dependencies).toHaveProperty('@seminar/theme-default');
    expect(read(path.join(cwd, 'my-talk'), 'vite.config.ts')).toContain(
      'selfContained: true',
    );
    await run(['minimal', '--yes', '--plugins', 'none', '--theme', 'custom'], {
      cwd,
      interactive: false,
      output: vi.fn(),
    });
    const minimal = JSON.parse(
      read(path.join(cwd, 'minimal'), 'package.json'),
    ) as Manifest;
    for (const name of Object.values(packages))
      expect(minimal.dependencies).not.toHaveProperty(name);
    expect(minimal.dependencies).toHaveProperty('@fontsource/roboto');
  });
  it.each([
    ['--self-contained', true],
    ['--no-self-contained', false],
  ] as const)('accepts %s with --yes', async (flag, enabled) => {
    const cwd = workspace();
    const ask = vi.fn();
    await run(['talk', '--yes', flag], {
      cwd,
      interactive: true,
      ask,
      output: vi.fn(),
    });
    expect(ask).not.toHaveBeenCalled();
    expect(read(path.join(cwd, 'talk'), 'vite.config.ts')).toContain(
      `selfContained: ${String(enabled)}`,
    );
  });
  it('defaults to self-contained builds for noninteractive flags', async () => {
    const cwd = workspace();
    await run(['talk', '--plugins', 'none', '--theme', 'default'], {
      cwd,
      interactive: false,
      output: vi.fn(),
    });
    expect(read(path.join(cwd, 'talk'), 'vite.config.ts')).toContain(
      'selfContained: true',
    );
  });
  it('does not write files on cancellation or incomplete noninteractive input', async () => {
    const cwd = workspace();
    await expect(run(['talk'], { cwd, interactive: false })).rejects.toThrow(
      /--plugins/,
    );
    await expect(
      run(['talk'], { cwd, interactive: true, ask: () => Promise.resolve({}) }),
    ).rejects.toThrow(/cancel/i);
    expect(readdirSync(cwd)).toEqual([]);
  });
  it.each([
    ['talk', '--plugins', 'nope', '--theme', 'default'],
    ['talk', '--plugins', 'none,mathjax', '--theme', 'default'],
    ['talk', '--plugins', 'elements,,shiki', '--theme', 'default'],
    ['talk', '--plugins', 'none', '--theme', 'unknown'],
    ['one', 'two', '--yes'],
    ['talk', '--force'],
  ])('rejects invalid arguments %j without writing files', async (...args) => {
    const cwd = workspace();
    await expect(run(args, { cwd, interactive: false })).rejects.toThrow();
    expect(readdirSync(cwd)).toEqual([]);
  });
  it('prints help without prompting or creating a project', async () => {
    const cwd = workspace();
    const output = vi.fn();
    await run(['--help'], { cwd, interactive: false, output });
    expect(output.mock.calls.flat().join('\n')).toContain('--plugins');
    expect(readdirSync(cwd)).toEqual([]);
  });
});

describe('dependency installation', () => {
  it('offers installation by default and creates files before installing', async () => {
    const cwd = workspace();
    const installDependencies = vi.fn((directory: string) => {
      expect(read(directory, 'package.json')).toContain('"private": true');
      return Promise.resolve();
    });
    const ask = vi.fn((questions: { name?: unknown; initial?: unknown }[]) => {
      expect(questions).toHaveLength(1);
      expect(questions[0]).toMatchObject({ name: 'install', initial: true });
      return Promise.resolve({ install: true });
    });
    const output = vi.fn();
    await run(
      [
        'talk',
        '--plugins',
        'none',
        '--theme',
        'default',
        '--self-contained',
        '--pdf',
        'slides',
      ],
      { cwd, interactive: true, ask, installDependencies, output },
    );
    expect(installDependencies).toHaveBeenCalledExactlyOnceWith(
      path.join(cwd, 'talk'),
    );
    const messages = output.mock.calls.flat().join('\n');
    expect(messages).toContain('npm run dev');
    expect(messages).not.toContain('  npm install\n');
  });
  it.each([
    [[], true],
    [['--install'], true],
    [['--no-install'], false],
  ] as const)(
    'respects installation flags %j with --yes',
    async (flags, install) => {
      const cwd = workspace();
      const installDependencies = vi.fn(() => Promise.resolve());
      const ask = vi.fn();
      const output = vi.fn();
      await run(['talk', '--yes', ...flags], {
        cwd,
        interactive: false,
        ask,
        installDependencies,
        output,
      });
      expect(ask).not.toHaveBeenCalled();
      expect(installDependencies).toHaveBeenCalledTimes(install ? 1 : 0);
      expect(
        output.mock.calls.flat().join('\n').includes('  npm install\n'),
      ).toBe(!install);
    },
  );
  it('allows declining the installation prompt', async () => {
    const cwd = workspace();
    const installDependencies = vi.fn(() => Promise.resolve());
    const output = vi.fn();
    await run(
      [
        'talk',
        '--plugins',
        'none',
        '--theme',
        'default',
        '--self-contained',
        '--pdf',
        'slides',
      ],
      {
        cwd,
        interactive: true,
        ask: () => Promise.resolve({ install: false }),
        installDependencies,
        output,
      },
    );
    expect(installDependencies).not.toHaveBeenCalled();
    expect(output.mock.calls.flat().join('\n')).toContain('  npm install\n');
  });
  it('keeps the project and explains how to retry a failed install', async () => {
    const cwd = workspace();
    const output = vi.fn();
    await expect(
      run(['talk', '--yes'], {
        cwd,
        interactive: false,
        output,
        installDependencies: () =>
          Promise.reject(new Error('Registry offline')),
      }),
    ).rejects.toThrow(/Registry offline.*npm install/s);
    expect(read(path.join(cwd, 'talk'), 'decks/index.deck.mdx')).toContain(
      'My talk',
    );
    expect(output.mock.calls.flat().join('\n')).not.toContain('Next steps:');
  });
  it.each([0, 7])(
    'runs npm install in the project and handles exit code %i',
    async (code) => {
      const cwd = workspace();
      const bin = path.join(workspace(), 'bin');
      mkdirSync(bin);
      const script = `require('node:fs').writeFileSync('.install-receipt.json', JSON.stringify(process.argv.slice(2)));\nprocess.exitCode = ${String(code)};\n`;
      if (process.platform === 'win32') {
        writeFileSync(path.join(bin, 'npm.cjs'), script);
        writeFileSync(
          path.join(bin, 'npm.cmd'),
          `@echo off\r\n"${process.execPath}" "%~dp0npm.cjs" %*\r\n`,
        );
      } else {
        writeFileSync(
          path.join(bin, 'npm'),
          `#!${process.execPath}\n${script}`,
        );
        chmodSync(path.join(bin, 'npm'), 0o755);
      }
      vi.stubEnv('PATH', `${bin}${path.delimiter}${process.env['PATH'] ?? ''}`);
      const result = runCli(['My Talk', '--yes'], {
        cwd,
        interactive: false,
        output: vi.fn(),
      });
      if (code === 0) await result;
      else await expect(result).rejects.toThrow(/7.*npm install/s);
      expect(
        JSON.parse(read(path.join(cwd, 'My Talk'), '.install-receipt.json')),
      ).toEqual(['install']);
    },
  );
  it('keeps the project if npm cannot be started', async () => {
    const cwd = workspace();
    vi.stubEnv('PATH', workspace());
    await expect(
      runCli(['talk', '--yes'], {
        cwd,
        interactive: false,
        output: vi.fn(),
      }),
    ).rejects.toThrow(/Could not install dependencies:.*npm install/s);
    expect(read(path.join(cwd, 'talk'), 'package.json')).toContain(
      '"private": true',
    );
  });
});
