import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { findCli } from './cli.ts';

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
