import {
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

import { run } from './cli.ts';
import { createProject, VERSION, type Plugin } from './project.ts';

const temporary: string[] = [];
function workspace() {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'create-seminar-test-'));
  temporary.push(directory);
  return directory;
}
afterEach(() => {
  for (const directory of temporary.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
const plugins: Plugin[] = ['elements', 'mathjax', 'shiki'];
const packages: Record<Plugin, string> = {
  elements: '@seminar/elements',
  mathjax: '@seminar/plugin-mathjax',
  shiki: '@seminar/plugin-shiki',
};
const read = (directory: string, file: string) =>
  readFileSync(path.join(directory, file), 'utf8');
interface Manifest {
  name: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

for (let mask = 0; mask < 8; mask++) {
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
      expect(deck.includes(':::columns')).toBe(selected.includes('elements'));
      expect(deck.includes('$')).toBe(selected.includes('mathjax'));
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
      ['My Talk', '--plugins', 'mathjax,elements', '--theme', 'custom'],
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
    const ask = vi.fn(() => Promise.resolve({ plugins: [], theme: 'custom' }));
    await run(['talk'], { cwd, interactive: true, ask, output: vi.fn() });
    expect(ask.mock.calls).toHaveLength(1);
    const manifest = JSON.parse(
      read(path.join(cwd, 'talk'), 'package.json'),
    ) as Manifest;
    expect(manifest.dependencies).not.toHaveProperty('@seminar/elements');
    expect(manifest.dependencies).toHaveProperty('@fontsource/roboto');
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
