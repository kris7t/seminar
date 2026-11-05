import { fileURLToPath } from 'node:url';

import typescript from 'typescript';
import { describe, expect, it } from 'vitest';

import { findOverrideShorthands } from './overrideShorthands.ts';

const CONFIG = fileURLToPath(
  new URL('../../tsconfig.test.json', import.meta.url),
);

const FILE = fileURLToPath(new URL('deck.directives.tsx', import.meta.url));

/**
 * Returns the shorthands found in a file with `source`, as their names and
 * kinds, with the types of the `@seminar/core` of the workspace.
 */
function find(source: string): string[] {
  const { options } =
    typescript.getParsedCommandLineOfConfigFile(
      CONFIG,
      {},
      {
        ...typescript.sys,
        onUnRecoverableConfigFileDiagnostic: () => undefined,
      },
    ) ?? {};
  const compilerOptions: typescript.CompilerOptions = {
    ...options,
    jsx: typescript.JsxEmit.Preserve,
    customConditions: ['@seminar/source'],
    noEmit: true,
  };
  const host = typescript.createCompilerHost(compilerOptions);
  const getSourceFile = host.getSourceFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  host.getSourceFile = (fileName, ...rest) =>
    fileName === FILE
      ? typescript.createSourceFile(
          fileName,
          source,
          typescript.ScriptTarget.Latest,
          true,
          typescript.ScriptKind.TSX,
        )
      : getSourceFile(fileName, ...rest);
  host.fileExists = (fileName) => fileName === FILE || fileExists(fileName);
  const program = typescript.createProgram([FILE], compilerOptions, host);
  return findOverrideShorthands(typescript, program, FILE).map(
    ({ start, end, kind }) => `${kind}:${source.slice(start, end)}`,
  );
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
