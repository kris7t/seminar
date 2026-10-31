import typescript from 'typescript';
import { describe, expect, it } from 'vitest';

import { createDeckServicePlugins } from './services.ts';

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
});
