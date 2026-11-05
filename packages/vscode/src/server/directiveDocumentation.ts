import type ts from 'typescript';

/**
 * Joins the parts of a doc comment into Markdown, with the names of links,
 * like `{@link Callout}`, as code. Names that TypeScript doesn't resolve are
 * the text of the link.
 */
function toMarkdown(parts: readonly ts.SymbolDisplayPart[]): string {
  return parts
    .map(({ kind, text }, index) => {
      if (kind === 'link') {
        return '';
      }
      if (
        kind === 'linkName' ||
        (kind === 'linkText' && parts[index - 1]?.kind === 'link')
      ) {
        return `\`${text.trim()}\``;
      }
      return text;
    })
    .join('');
}

/**
 * Returns the documentation of what the file `fileName` of `program` imports
 * as `local`, e.g., the doc comment of the component of a directive, as
 * Markdown, if it has any.
 */
export function importedDocumentation(
  typescript: typeof ts,
  program: ts.Program,
  fileName: string,
  local: string,
): string | undefined {
  const file = program.getSourceFile(fileName);
  if (file === undefined) {
    return undefined;
  }
  const checker = program.getTypeChecker();
  for (const statement of file.statements) {
    const bindings = typescript.isImportDeclaration(statement)
      ? statement.importClause?.namedBindings
      : undefined;
    if (bindings === undefined || !typescript.isNamedImports(bindings)) {
      continue;
    }
    const specifier = bindings.elements.find(({ name }) => name.text === local);
    if (specifier === undefined) {
      continue;
    }
    const alias = checker.getSymbolAtLocation(specifier.name);
    const symbol =
      alias !== undefined && alias.flags & typescript.SymbolFlags.Alias
        ? checker.getAliasedSymbol(alias)
        : alias;
    const documentation = toMarkdown(
      symbol?.getDocumentationComment(checker) ?? [],
    ).trim();
    return documentation === '' ? undefined : documentation;
  }
  return undefined;
}
