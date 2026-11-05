import typescript from 'typescript';
import { describe, expect, it } from 'vitest';

import { findOverrideShorthands } from './overrideShorthands.ts';
import { VIRTUAL_FILE, workspaceProgram } from './test/workspaceProgram.ts';

/**
 * Returns the shorthands found in a file with `source`, as their names and
 * kinds, with the types of the `@seminar/core` of the workspace.
 */
function find(source: string): string[] {
  return findOverrideShorthands(
    typescript,
    workspaceProgram(source),
    VIRTUAL_FILE,
  ).map(({ start, end, kind }) => `${kind}:${source.slice(start, end)}`);
}

const AUGMENTATION = `export {};
declare module '@seminar/core' {
  interface StepBehaviorOverrides { fancy: true }
  interface SlideMasterOverrides { wide: true }
}
`;

describe('findOverrideShorthands', () => {
  it('finds the shorthands added by augmenting the core', () => {
    expect(
      find(`${AUGMENTATION}
declare function _SeminarSlideDirective(props: import("@seminar/core").SlideDirectiveAttributes): null;
declare function _SeminarStepDirective(props: import("@seminar/core").StepDirectiveAttributes): null;
declare function Box(props: import("@seminar/core").StepProps): null;
declare function Diagram(props: import("@seminar/plugin-pele").DiagramStepProps): null;
<_SeminarSlideDirective wide section />;
<_SeminarStepDirective fancy only />;
<Box fancy step />;
<Diagram fancy />;
`),
    ).toEqual([
      'master:wide',
      'behavior:fancy',
      'behavior:fancy',
      'behavior:fancy',
    ]);
  });

  it('leaves out props of the same names that components declare', () => {
    expect(
      find(`${AUGMENTATION}
declare function Column(props: { fancy?: boolean; wide?: boolean }): null;
<Column fancy wide />;
<Column fancy={true} />;
`),
    ).toEqual([]);
  });
});
