import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DirectiveLoader } from './directiveLoader.ts';

let project: string;
let loader: DirectiveLoader;

beforeEach(async () => {
  project = await mkdtemp(path.join(os.tmpdir(), 'seminar-directives-'));
  loader = new DirectiveLoader();
});

afterEach(async () => {
  loader.dispose();
  await rm(project, { recursive: true, force: true });
});

/**
 * Installs a fake Vite into `project`, whose config has a Seminar plugin that
 * registers the theme of the deck as a directive, and warns with the number
 * of requests to its worker.
 */
async function vite(config = ''): Promise<void> {
  const directory = path.join(project, 'node_modules/vite');
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, 'package.json'),
    JSON.stringify({ name: 'vite', type: 'module', exports: './index.js' }),
  );
  await writeFile(
    path.join(directory, 'index.js'),
    `let requests = 0;
export async function resolveConfig() {
  ${config}
  return {
    configFileDependencies: [${JSON.stringify(path.join(project, 'vite.config.js'))}],
    plugins: [
      { name: 'react' },
      {
        name: 'seminar',
        async directiveComponents(source, deck) {
          requests += 1;
          const theme = /theme: (.*)/.exec(source)?.[1] ?? 'none';
          return {
            directives: { [theme]: { source: deck, exportName: 'Theme' } },
            dependencies: [${JSON.stringify(path.join(project, 'theme.ts'))}],
            warnings: [String(requests)],
          };
        },
      },
    ],
  };
}`,
  );
  await writeFile(path.join(project, 'vite.config.js'), '');
}

describe('DirectiveLoader', () => {
  it('loads the directives of the Seminar plugin of the Vite config', async () => {
    await vite();
    const deck = path.join(project, 'decks/talk.deck.mdx');
    expect(await loader.load(deck, '---\ntheme: fancy\n---\n# Talk')).toEqual({
      directives: { fancy: { source: deck, exportName: 'Theme' } },
      dependencies: [path.join(project, 'theme.ts')],
      warnings: ['1'],
    });
  });

  it('loads the directives again only for other themes', async () => {
    await vite();
    const deck = path.join(project, 'talk.deck.mdx');
    await loader.load(deck, '---\ntheme: fancy\n---\n# Talk');
    expect(
      (await loader.load(deck, '---\ntheme: fancy\n---\n# Changed')).warnings,
    ).toEqual(['1']);
    expect(
      (await loader.load(deck, '---\ntheme: plain\n---\n# Talk')).warnings,
    ).toEqual(['2']);
  });

  it('loads the directives again when their files change', async () => {
    await vite();
    const deck = path.join(project, 'talk.deck.mdx');
    await loader.load(deck, '# Talk');
    await loader.load(deck, '---\ntheme: fancy\n---\n# Talk');
    loader.invalidate(path.join(project, 'theme.ts'));
    // A new worker, which counts requests from 1.
    expect(
      (await loader.load(deck, '---\ntheme: fancy\n---\n# Talk')).warnings,
    ).toEqual(['1']);
    expect((await loader.load(deck, '# Talk')).warnings).toEqual(['2']);
  });

  it('tells changes to the real files of linked dependencies', async () => {
    await vite();
    await mkdir(path.join(project, 'packages'));
    await writeFile(path.join(project, 'packages/theme.ts'), '');
    await symlink(
      path.join(project, 'packages/theme.ts'),
      path.join(project, 'theme.ts'),
    );
    const deck = path.join(project, 'talk.deck.mdx');
    await loader.load(deck, '# Talk');
    await loader.load(deck, '---\ntheme: fancy\n---\n# Talk');
    loader.invalidate(path.join(project, 'packages/theme.ts'));
    expect((await loader.load(deck, '# Talk')).warnings).toEqual(['1']);
  });

  it('loads the config again when it changes', async () => {
    await vite();
    const deck = path.join(project, 'talk.deck.mdx');
    await loader.load(deck, '---\ntheme: fancy\n---\n# Talk');
    await loader.load(deck, '---\ntheme: plain\n---\n# Talk');
    loader.invalidate(path.join(project, 'vite.config.js'));
    expect(
      (await loader.load(deck, '---\ntheme: plain\n---\n# Talk')).warnings,
    ).toEqual(['1']);
    expect(
      (await loader.load(deck, '---\ntheme: fancy\n---\n# Talk')).warnings,
    ).toEqual(['2']);
  });

  it('tells why the config cannot be loaded', async () => {
    await vite('throw new Error("Broken config");');
    await expect(
      loader.load(path.join(project, 'talk.deck.mdx'), '# Talk'),
    ).rejects.toThrow('Broken config');
  });

  it('rejects decks outside of Vite projects', async () => {
    await expect(
      loader.load(path.join(project, 'talk.deck.mdx'), '# Talk'),
    ).rejects.toThrow("isn't in a Vite project");
  });
});
