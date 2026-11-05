import {
  directiveAttributeValue,
  IMAGE_ATTRIBUTES,
  readAttributeWords,
} from '@seminar/mdx/syntax';
import type { CodeInformation, CodeMapping } from '@volar/language-server';
import type { Code, Nodes, Root } from 'mdast';
import type {
  ContainerDirective,
  LeafDirective,
  TextDirective,
} from 'mdast-util-directive';

import type { DirectiveComponent } from './directiveLoader.ts';
import {
  readDirectiveSyntax,
  type DirectiveAttribute,
} from './directiveSyntax.ts';

type Directive = ContainerDirective | LeafDirective | TextDirective;

/** Values of the `formProp` of directive components, see `DirectiveForm`. */
const FORMS: Record<Directive['type'], string> = {
  textDirective: 'text',
  leafDirective: 'leaf',
  containerDirective: 'container',
};

/**
 * The types in `@seminar/core` of the attributes of the directives that
 * Seminar handles itself, which take precedence over components. The
 * attribute blocks of headings and images are directives, too.
 */
const BUILT_IN: Readonly<Record<string, string>> = {
  step: 'StepDirectiveAttributes',
  slide: 'SlideDirectiveAttributes',
  recap: 'RecapDirectiveAttributes',
  include: 'IncludeDirectiveAttributes',
  notes: 'NotesDirectiveAttributes',
  [IMAGE_ATTRIBUTES]: 'ImageDirectiveAttributes',
};

/** The type of the props of the steps of diagrams, like `%% step only`. */
const DIAGRAM_STEP = {
  type: 'DiagramStepProps',
  module: '@seminar/plugin-pele',
  local: '_SeminarDiagramStep',
};

/** Matches the comments of steps in diagrams, see `plugin-pele`. */
const MERMAID_STEP = /^[> \t]*%%[ \t]*(step)(?:\[[^\]\r\n]*\])?[ \t]+(.*)$/dgm;

/** What the code that is mapped to the deck supports. */
const MAPPED: CodeInformation = {
  verification: true,
  completion: true,
  semantic: true,
  navigation: true,
};

/**
 * What values support, which aren't completed, since the end of the last one
 * is also where new attributes are completed.
 */
const VALUE: CodeInformation = { ...MAPPED, completion: false };

/** Code generated for the directives of a deck, mapped to the deck. */
export interface DirectiveCode {
  text: string;
  mappings: CodeMapping[];
}

function isDirective(node: Nodes): node is Directive {
  return (
    node.type === 'textDirective' ||
    node.type === 'leafDirective' ||
    node.type === 'containerDirective'
  );
}

/** Whether `node` is a Mermaid diagram, whose steps `plugin-pele` reads. */
function isDiagram(node: Nodes): node is Code {
  return node.type === 'code' && node.lang?.toLowerCase() === 'mermaid';
}

/** Whether `node` is the label of a container directive. */
function isLabel(node: Nodes | undefined): boolean {
  return node?.type === 'paragraph' && node.data?.directiveLabel === true;
}

/** Whether the directive has content that its component gets as children. */
function hasChildren(node: Directive, component: DirectiveComponent): boolean {
  const content =
    node.type === 'containerDirective' && component.labelProp !== undefined
      ? node.children.filter((child) => !isLabel(child))
      : node.children;
  return content.length > 0;
}

/** Builds code and its mappings to the deck. */
class Builder {
  text = '';
  readonly mappings: CodeMapping[] = [];

  /** Appends `text`, unmapped. */
  add(text: string): void {
    this.text += text;
  }

  /** Appends `text` for the source at `start` to `end`. */
  map(text: string, start: number, end: number, data = MAPPED): void {
    this.mappings.push({
      sourceOffsets: [start],
      generatedOffsets: [this.text.length],
      lengths: [end - start],
      ...(text.length === end - start
        ? {}
        : { generatedLengths: [text.length] }),
      data,
    });
    this.text += text;
  }
}

function addAttribute(
  code: Builder,
  directive: string,
  attribute: DirectiveAttribute,
): void {
  const { name, nameStart, nameEnd, value, valueStart, valueEnd, quoted } =
    attribute;
  code.add(' ');
  if (name === '#') {
    code.map('id', nameStart, nameEnd);
  } else {
    code.map(name === 'class' ? 'className' : name, nameStart, nameEnd);
  }
  const parsed =
    name === '#'
      ? value
      : directiveAttributeValue(directive, name, value, quoted);
  if (parsed === true && value === undefined) {
    return;
  }
  code.add('=');
  code.map(`{${JSON.stringify(parsed)}}`, valueStart, valueEnd, VALUE);
}

/** The name of the function for the type of the attributes `type`. */
function builtInName(type: string): string {
  return `_Seminar${type.replace(/Attributes$/, '')}`;
}

/**
 * Generates TypeScript for the directives of the deck `source` that have
 * components, which renders each directive with the props that compiling the
 * deck would give it, so that TypeScript checks them against the types of the
 * props of the components. The directives of Seminar, like `:step` and the
 * attribute blocks of headings, are checked against the types of their
 * attributes in `@seminar/core` the same way. The names of the directives and
 * their attributes are mapped to the deck. The content of directives is left
 * out.
 *
 * Classes, e.g., `.wide`, are left out, since components get them joined as
 * `className`.
 */
export function generateDirectiveCode(
  source: string,
  root: Root,
  directives: Readonly<Record<string, DirectiveComponent>>,
): DirectiveCode {
  const imports = new Map<DirectiveComponent, string>();
  // The functions declared for the types of attributes, by their names.
  const declarations = new Map<string, string>();
  const declare = (local: string, module: string, type: string) => {
    declarations.set(
      local,
      `declare function ${local}(props: import(${JSON.stringify(module)}).${type}): null;\n`,
    );
  };
  const code = new Builder();
  const visit = (node: Nodes): void => {
    const start = node.position?.start.offset;
    if (isDirective(node) && start !== undefined) {
      const builtIn = Object.hasOwn(BUILT_IN, node.name)
        ? BUILT_IN[node.name]
        : undefined;
      const component =
        builtIn === undefined ? directives[node.name] : undefined;
      let local: string | undefined;
      if (builtIn !== undefined) {
        local = builtInName(builtIn);
        declare(local, '@seminar/core', builtIn);
      } else if (component !== undefined) {
        local = imports.get(component);
        if (local === undefined) {
          local = `_SeminarDirective${String(imports.size)}`;
          imports.set(component, local);
        }
      }
      if (local !== undefined) {
        const syntax = readDirectiveSyntax(source, start);
        code.add('<');
        code.map(local, syntax.nameStart, syntax.nameEnd);
        if (component?.formProp !== undefined) {
          code.add(
            ` ${component.formProp}=${JSON.stringify(FORMS[node.type])}`,
          );
        }
        if (
          node.type === 'containerDirective' &&
          component?.labelProp !== undefined &&
          isLabel(node.children[0])
        ) {
          code.add(` ${component.labelProp}=""`);
        }
        for (const attribute of syntax.attributes) {
          if (attribute.name !== '.') {
            addAttribute(code, node.name, attribute);
          }
        }
        if (component !== undefined && hasChildren(node, component)) {
          code.add(' children={null!}');
        }
        code.add(' ');
        if (syntax.attributesEnd !== undefined) {
          // Where new attributes are completed.
          code.map('', syntax.attributesEnd, syntax.attributesEnd);
        }
        code.add('/>;\n');
      }
    }
    if (isDiagram(node) && start !== undefined) {
      const end = node.position?.end.offset ?? source.length;
      for (const match of source.slice(start, end).matchAll(MERMAID_STEP)) {
        const [name, words] = [match.indices?.[1], match.indices?.[2]];
        if (name === undefined || words === undefined) {
          continue;
        }
        declare(DIAGRAM_STEP.local, DIAGRAM_STEP.module, DIAGRAM_STEP.type);
        const offset = start + words[0];
        code.add('<');
        code.map(DIAGRAM_STEP.local, start + name[0], start + name[1]);
        for (const attribute of readAttributeWords(match[2] ?? '')) {
          if (attribute.name !== '.') {
            addAttribute(code, 'step', {
              ...attribute,
              nameStart: offset + attribute.nameStart,
              nameEnd: offset + attribute.nameEnd,
              valueStart: offset + attribute.valueStart,
              valueEnd: offset + attribute.valueEnd,
            });
          }
        }
        code.add(' ');
        // Where new attributes are completed.
        code.map('', start + words[1], start + words[1]);
        code.add('/>;\n');
      }
    }
    if ('children' in node) {
      for (const child of node.children) {
        visit(child);
      }
    }
  };
  visit(root);
  const header = [
    ...[...imports].map(
      ([{ source: module, exportName }, local]) =>
        `import { ${exportName} as ${local} } from ${JSON.stringify(module)};\n`,
    ),
    ...declarations.values(),
  ].join('');
  return {
    text: `${header}${code.text}export {};\n`,
    mappings: code.mappings.map((mapping) => ({
      ...mapping,
      generatedOffsets: mapping.generatedOffsets.map(
        (offset) => offset + header.length,
      ),
    })),
  };
}
