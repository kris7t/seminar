import type { Program } from 'estree';
import { parse } from 'acorn';
import type {
  MdxJsxAttribute,
  MdxJsxExpressionAttribute,
  MdxjsEsm,
} from 'mdast-util-mdx';

/**
 * Parses JavaScript code into an ESTree program, as stored in the `estree`
 * data of MDX nodes.
 */
function parseProgram(code: string): Program {
  return parse(code, {
    ecmaVersion: 'latest',
    sourceType: 'module',
  }) as unknown as Program;
}

/** Creates an MDX ESM node, e.g., for an import or export. */
export function createEsm(code: string): MdxjsEsm {
  return {
    type: 'mdxjsEsm',
    value: code,
    data: { estree: parseProgram(code) },
  };
}

/** Creates a JSX attribute with a string value. */
export function createStringAttribute(
  name: string,
  value: string,
): MdxJsxAttribute {
  return { type: 'mdxJsxAttribute', name, value };
}

/** Creates a JSX attribute with a JavaScript expression as its value. */
export function createExpressionAttribute(
  name: string,
  code: string,
): MdxJsxAttribute {
  return {
    type: 'mdxJsxAttribute',
    name,
    value: {
      type: 'mdxJsxAttributeValueExpression',
      value: code,
      data: { estree: parseProgram(code) },
    },
  };
}

/** Creates a JSX spread attribute, e.g., `{...props}`. */
export function createSpreadAttribute(code: string): MdxJsxExpressionAttribute {
  return {
    type: 'mdxJsxExpressionAttribute',
    value: `...${code}`,
    data: { estree: parseProgram(`({...${code}})`) },
  };
}
