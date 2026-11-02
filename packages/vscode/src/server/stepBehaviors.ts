import type { BuiltInStepBehavior } from '@seminar/core';
import type ts from 'typescript';

const BUILT_IN: Record<BuiltInStepBehavior, true> = {
  reveal: true,
  dim: true,
  preview: true,
  focus: true,
  only: true,
  scoped: true,
  insert: true,
  expand: true,
  swap: true,
  always: true,
};

/** The step behaviors of programs that have `@seminar/core`. */
const inPrograms = new WeakMap<ts.Program, ReadonlySet<string>>();

function behaviorsOfCore(
  typescript: typeof ts,
  program: ts.Program,
  core: ts.SourceFile,
): string[] {
  const checker = program.getTypeChecker();
  const module = checker.getSymbolAtLocation(core);
  const exported =
    module &&
    checker
      .getExportsOfModule(module)
      .find(({ name }) => name === 'StepBehavior');
  if (exported === undefined) {
    return [];
  }
  const type = checker.getDeclaredTypeOfSymbol(
    exported.flags & typescript.SymbolFlags.Alias
      ? checker.getAliasedSymbol(exported)
      : exported,
  );
  return (type.isUnion() ? type.types : [type]).flatMap((member) =>
    member.isStringLiteral() ? [member.value] : [],
  );
}

/**
 * Returns the names of the step behaviors for the file `deck`: the members of
 * the `StepBehavior` type of its `@seminar/core`, including those added by
 * module augmentation.
 *
 * Augmentations can only be in a program that has `@seminar/core`, so the built-in
 * behaviors are all there are in a program that doesn't.
 */
export function findStepBehaviors(
  typescript: typeof ts,
  program: ts.Program | undefined,
  deck: string,
): ReadonlySet<string> {
  if (program === undefined) {
    return new Set(Object.keys(BUILT_IN));
  }
  const known = inPrograms.get(program);
  if (known !== undefined) {
    return known;
  }
  const { resolvedModule } = typescript.resolveModuleName(
    '@seminar/core',
    deck,
    program.getCompilerOptions(),
    typescript.sys,
  );
  const core =
    resolvedModule && program.getSourceFile(resolvedModule.resolvedFileName);
  const found = core ? behaviorsOfCore(typescript, program, core) : [];
  const behaviors = new Set(found.length > 0 ? found : Object.keys(BUILT_IN));
  inPrograms.set(program, behaviors);
  return behaviors;
}
