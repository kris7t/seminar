import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import typescript from 'typescript';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { findStepBehaviors } from './stepBehaviors.ts';

describe('findStepBehaviors', () => {
  let project: string;

  beforeEach(() => {
    project = mkdtempSync(path.join(tmpdir(), 'seminar-vscode-'));
    const core = path.join(project, 'node_modules', '@seminar', 'core');
    mkdirSync(core, { recursive: true });
    writeFileSync(
      path.join(core, 'package.json'),
      JSON.stringify({ name: '@seminar/core', types: './index.d.ts' }),
    );
    writeFileSync(
      path.join(core, 'index.d.ts'),
      `export interface StepBehaviorOverrides {}
export type StepBehavior = 'only' | 'swap' | keyof StepBehaviorOverrides;
`,
    );
  });

  afterEach(() => {
    rmSync(project, { recursive: true });
  });

  /** Returns the behaviors in a program of a file with `source`. */
  function behaviors(source: string): string[] {
    const file = path.join(project, 'theme.ts');
    writeFileSync(file, source);
    const program = typescript.createProgram([file], {
      module: typescript.ModuleKind.ESNext,
      moduleResolution: typescript.ModuleResolutionKind.Bundler,
      noLib: true,
    });
    return [
      ...findStepBehaviors(
        typescript,
        program,
        path.join(project, 'index.deck.mdx'),
      ),
    ].sort();
  }

  it('reads the behaviors of the core of the project', () => {
    expect(behaviors(`import '@seminar/core';`)).toEqual(['only', 'swap']);
  });

  it('includes behaviors added by module augmentation', () => {
    expect(
      behaviors(`import '@seminar/core';
declare module '@seminar/core' {
  interface StepBehaviorOverrides {
    fancy: true;
  }
}
`),
    ).toEqual(['fancy', 'only', 'swap']);
  });

  it('falls back to the built-in behaviors without the core', () => {
    const built = behaviors('export {};');
    expect(built).toContain('reveal');
    expect(built).toContain('always');
    expect(built).not.toContain('fancy');
  });
});
