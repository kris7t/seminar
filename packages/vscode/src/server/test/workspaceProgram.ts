import { fileURLToPath } from 'node:url';

import typescript from 'typescript';

const CONFIG = fileURLToPath(
  new URL('../../../tsconfig.test.json', import.meta.url),
);

/** A virtual file next to the tests, as decks have their virtual code. */
export const VIRTUAL_FILE = fileURLToPath(
  new URL('../deck.directives.tsx', import.meta.url),
);

/**
 * Returns a program of {@link VIRTUAL_FILE} with `source`, with the types of
 * the packages of the workspace, from their sources.
 */
export function workspaceProgram(source: string): typescript.Program {
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
    // Like the projects of decks, which needn't list the files they import.
    composite: false,
  };
  const host = typescript.createCompilerHost(compilerOptions);
  const getSourceFile = host.getSourceFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  host.getSourceFile = (fileName, ...rest) =>
    fileName === VIRTUAL_FILE
      ? typescript.createSourceFile(
          fileName,
          source,
          typescript.ScriptTarget.Latest,
          true,
          typescript.ScriptKind.TSX,
        )
      : getSourceFile(fileName, ...rest);
  host.fileExists = (fileName) =>
    fileName === VIRTUAL_FILE || fileExists(fileName);
  return typescript.createProgram([VIRTUAL_FILE], compilerOptions, host);
}
