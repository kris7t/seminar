import type ts from 'typescript';

/** What a shorthand added by module augmentation stands for. */
export type ShorthandKind = 'behavior' | 'master';

/** The interfaces of `@seminar/core` that themes augment with shorthands. */
const OVERRIDES: Readonly<Record<string, ShorthandKind>> = {
  StepBehaviorOverrides: 'behavior',
  SlideMasterOverrides: 'master',
};

/** A bare attribute that is a shorthand added by module augmentation. */
export interface OverrideShorthand {
  /** Offsets of the name of the attribute in the file. */
  start: number;
  end: number;
  kind: ShorthandKind;
}

/** Returns what the property `symbol` is a shorthand for, if anything. */
function kindOf(
  typescript: typeof ts,
  symbol: ts.Symbol | undefined,
): ShorthandKind | undefined {
  for (const { parent } of symbol?.declarations ?? []) {
    if (
      typescript.isInterfaceDeclaration(parent) &&
      Object.hasOwn(OVERRIDES, parent.name.text)
    ) {
      return OVERRIDES[parent.name.text];
    }
  }
  return undefined;
}

/**
 * Finds the bare JSX attributes in `fileName` of `program` that are step
 * behaviors or slide masters added by augmenting `StepBehaviorOverrides` or
 * `SlideMasterOverrides`, i.e., whose props are declared there, which the
 * shorthands of `@seminar/core` are mapped from. Props of the same names that
 * components declare themselves aren't shorthands.
 */
export function findOverrideShorthands(
  typescript: typeof ts,
  program: ts.Program,
  fileName: string,
): OverrideShorthand[] {
  const file = program.getSourceFile(fileName);
  if (file === undefined) {
    return [];
  }
  const checker = program.getTypeChecker();
  const found: OverrideShorthand[] = [];
  const visit = (node: ts.Node): void => {
    if (
      typescript.isJsxAttribute(node) &&
      node.initializer === undefined &&
      typescript.isIdentifier(node.name)
    ) {
      const props = checker.getContextualType(node.parent);
      const kind = kindOf(
        typescript,
        props && checker.getPropertyOfType(props, node.name.text),
      );
      if (kind !== undefined) {
        found.push({
          start: node.name.getStart(file),
          end: node.name.getEnd(),
          kind,
        });
      }
    }
    typescript.forEachChild(node, visit);
  };
  visit(file);
  return found;
}
