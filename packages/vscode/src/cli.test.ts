import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { deckOfPage, deckPage, findCli, findProject } from './cli.ts';

describe('findCli', () => {
  let project: string;
  let deck: string;

  beforeEach(() => {
    project = mkdtempSync(path.join(tmpdir(), 'seminar-vscode-'));
    mkdirSync(path.join(project, 'talks'));
    deck = path.join(project, 'talks', 'intro.deck.mdx');
  });

  afterEach(() => {
    rmSync(project, { recursive: true });
  });

  it('finds the script of the CLI of the project of the deck', () => {
    const cli = path.join(project, 'node_modules', '@seminar', 'cli');
    mkdirSync(cli, { recursive: true });
    writeFileSync(
      path.join(cli, 'package.json'),
      JSON.stringify({ bin: { seminar: './dist/index.js' } }),
    );
    expect(findCli(deck)).toBe(path.join(cli, 'dist', 'index.js'));
  });

  it('finds nothing if the CLI is not installed', () => {
    expect(findCli(deck)).toBeUndefined();
  });
});

describe('findProject', () => {
  let project: string;

  beforeEach(() => {
    project = mkdtempSync(path.join(tmpdir(), 'seminar-vscode-'));
    mkdirSync(path.join(project, 'nested', 'talks'), { recursive: true });
    writeFileSync(path.join(project, 'vite.config.ts'), '');
  });

  afterEach(() => {
    rmSync(project, { recursive: true });
  });

  it('finds the closest directory with a Vite config', () => {
    const deck = path.join(project, 'nested', 'talks', 'intro.deck.mdx');
    expect(findProject(deck)).toBe(project);
    writeFileSync(path.join(project, 'nested', 'vite.config.js'), '');
    expect(findProject(deck)).toBe(path.join(project, 'nested'));
  });
});

describe('deckOfPage', () => {
  it('returns the deck of the page', () => {
    expect(deckOfPage('/project', '/my%20talks/intro.html')).toBe(
      path.join('/project', 'my talks', 'intro.deck.mdx'),
    );
  });

  it('only accepts pages in the root', () => {
    expect(deckOfPage('/project', '/%2e%2e/secret.html')).toBeUndefined();
    expect(deckOfPage('/project', '/%.html')).toBeUndefined();
    expect(deckOfPage('/project', '/components')).toBeUndefined();
  });
});

describe('deckPage', () => {
  it('returns the URL of the page of the deck in the root', () => {
    expect(
      deckPage(
        'http://127.0.0.1:1234/',
        '/project/decks',
        "/project/decks/my talks/it's.deck.mdx",
        '?query',
      ),
    ).toBe("http://127.0.0.1:1234/my%20talks/it's.html?query");
  });

  it('has no page for decks outside of the root', () => {
    expect(
      deckPage(
        'http://127.0.0.1:1234/',
        '/project/decks',
        '/project/a.deck.mdx',
      ),
    ).toBeUndefined();
  });
});
