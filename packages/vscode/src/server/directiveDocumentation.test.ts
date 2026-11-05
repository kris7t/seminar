import typescript from 'typescript';
import { describe, expect, it } from 'vitest';

import { importedDocumentation } from './directiveDocumentation.ts';
import { VIRTUAL_FILE, workspaceProgram } from './test/workspaceProgram.ts';

describe('importedDocumentation', () => {
  const program =
    workspaceProgram(`import type { StepDirectiveAttributes as _SeminarDocumented0 } from "@seminar/core";
import type { Column as _SeminarDocumented1 } from "@seminar/elements";
import type { Missing as _SeminarDocumented2 } from "missing";
export {};
`);

  it('returns the doc comments of what the file imports', () => {
    expect(
      importedDocumentation(
        typescript,
        program,
        VIRTUAL_FILE,
        '_SeminarDocumented0',
      ),
    ).toMatch(/^Attributes of `:step`, `::step`, and `:::step` in MDX/);
    expect(
      importedDocumentation(
        typescript,
        program,
        VIRTUAL_FILE,
        '_SeminarDocumented1',
      ),
    ).toMatch(/^A column of `Columns`, e\.g\., `:::column\[Title\]` in MDX/);
  });

  it('returns nothing for what it cannot find', () => {
    expect(
      importedDocumentation(
        typescript,
        program,
        VIRTUAL_FILE,
        '_SeminarDocumented2',
      ),
    ).toBeUndefined();
    expect(
      importedDocumentation(typescript, program, VIRTUAL_FILE, '_Other'),
    ).toBeUndefined();
  });
});
