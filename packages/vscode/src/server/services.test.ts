import typescript from 'typescript';
import { describe, expect, it } from 'vitest';

import { createDeckServicePlugins } from './services.ts';
import { SLIDE_MASTER_TOKEN, STEP_BEHAVIOR_TOKEN } from './shorthandTokens.ts';

describe('createDeckServicePlugins', () => {
  it('has no commands that could clash with other extensions', () => {
    const plugins = createDeckServicePlugins(typescript, {} as never);
    expect(
      plugins.flatMap(
        ({ capabilities }) =>
          capabilities.executeCommandProvider?.commands ?? [],
      ),
    ).toEqual([]);
  });

  it('provides the semantic tokens of step behaviors and slide masters', () => {
    const plugins = createDeckServicePlugins(typescript, {} as never);
    expect(
      plugins.flatMap(
        ({ capabilities }) =>
          capabilities.semanticTokensProvider?.legend.tokenTypes ?? [],
      ),
    ).toEqual(
      expect.arrayContaining([STEP_BEHAVIOR_TOKEN, SLIDE_MASTER_TOKEN]),
    );
  });

  it('provides the diagnostics of directives again once components load', () => {
    const plugins = createDeckServicePlugins(typescript, {} as never);
    expect(
      plugins.find(({ name }) => name === 'seminar-directive-diagnostics')
        ?.capabilities.diagnosticProvider?.interFileDependencies,
    ).toBe(true);
  });
});
