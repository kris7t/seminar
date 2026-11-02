import typescript from 'typescript';
import { describe, expect, it } from 'vitest';

import { createDeckServicePlugins } from './services.ts';
import { STEP_BEHAVIOR_TOKEN } from './stepBehaviorTokens.ts';

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

  it('provides the semantic token of step behaviors', () => {
    const plugins = createDeckServicePlugins(typescript, {} as never);
    expect(
      plugins.flatMap(
        ({ capabilities }) =>
          capabilities.semanticTokensProvider?.legend.tokenTypes ?? [],
      ),
    ).toContain(STEP_BEHAVIOR_TOKEN);
  });
});
