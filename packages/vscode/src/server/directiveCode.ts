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

import type { DirectiveComponent, ModuleExport } from './directiveLoader.ts';
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
export const BUILT_IN: Readonly<Record<string, string>> = {
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
  /**
   * The names that the code imports the directives as, for their
   * documentation: the components of directives, and the types of the
   * attributes of the directives of Seminar.
   */
  documented: Record<string, string>;
}

function isDirective(node: Nodes): node is Directive {
  return (
    node.type === 'textDirective' ||
    node.type === 'leafDirective' ||
    node.type === 'containerDirective'
  );
}

/**
 * Appends the attributes in the line of words `text` at `offset` in the deck,
 * e.g., after the language of a code block, which are those of `:step`.
 */
function addAttributeWords(code: Builder, text: string, offset: number): void {
  for (const attribute of readAttributeWords(text)) {
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
}

/** The type of the attributes of code blocks that no handler renders. */
const DEFAULT_ATTRIBUTES = 'import("@seminar/core").CodeBlockAttributes';

/**
 * Returns the type of the props that the handler `handler` of code blocks
 * takes, see `CodeBlockHandlerFactory` of `@seminar/mdx`, without depending
 * on it.
 */
function handlerProps({ source, exportName }: ModuleExport): string {
  return `Parameters<ReturnType<typeof import(${JSON.stringify(source)}).${exportName}>>[0]["props"]`;
}

/**
 * Returns the type of the attributes of the code block `node`: the props that
 * the handler of its language, or else of `*`, takes, or those of the plain
 * `CodeBlock` of `@seminar/core`. Handlers may leave blocks to the next one,
 * which only compiling the deck tells.
 */
function attributesOf(
  node: Code,
  codeBlocks: Readonly<Record<string, ModuleExport>>,
): string | undefined {
  if (node.lang === null || node.lang === undefined) {
    return undefined;
  }
  const handler = Object.hasOwn(codeBlocks, node.lang)
    ? codeBlocks[node.lang]
    : Object.hasOwn(codeBlocks, '*')
      ? codeBlocks['*']
      : undefined;
  return handler === undefined ? DEFAULT_ATTRIBUTES : handlerProps(handler);
}

/**
 * Renders the attributes after the language of the code block `node` that
 * starts at `start` as an element `local`, with the language mapped to its
 * name, like those of `:step`.
 */
function addCodeBlock(
  code: Builder,
  source: string,
  start: number,
  node: Code,
  local: string,
): void {
  const line = /^.*/.exec(source.slice(start))?.[0] ?? '';
  const lang = node.lang ?? '';
  const langStart = line.indexOf(lang);
  const meta = node.meta ?? '';
  const metaStart = meta === '' ? -1 : line.lastIndexOf(meta);
  if (langStart === -1) {
    return;
  }
  code.add('<');
  code.map(local, start + langStart, start + langStart + lang.length);
  if (metaStart !== -1) {
    addAttributeWords(code, meta, start + metaStart);
  }
  code.add(' ');
  // Where new attributes are completed.
  code.map('', start + line.trimEnd().length, start + line.trimEnd().length);
  code.add('/>;\n');
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
  codeBlocks?: Readonly<Record<string, ModuleExport>>,
  theme?: string,
): DirectiveCode {
  const imports = new Map<DirectiveComponent, string>();
  const codeComponents = new Map<string, string>();
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
    // Code blocks are checked once their components are known.
    if (
      node.type === 'code' &&
      start !== undefined &&
      codeBlocks !== undefined
    ) {
      const type = attributesOf(node, codeBlocks);
      if (type !== undefined) {
        let local = codeComponents.get(type);
        if (local === undefined) {
          local = `_SeminarCodeBlock${String(codeComponents.size)}`;
          codeComponents.set(type, local);
          declarations.set(
            local,
            `declare function ${local}(props: ${type}): null;\n`,
          );
        }
        addCodeBlock(code, source, start, node, local);
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
        addAttributeWords(code, match[2] ?? '', offset);
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
  // Imported only for the documentation of the directives, e.g., to complete
  // their names, after the code so that its mappings stay the same.
  const documented: Record<string, string> = {};
  let documentation = '';
  const document = (name: string, module: string, exportName: string) => {
    const local = `_SeminarDocumented${String(Object.keys(documented).length)}`;
    documented[name] = local;
    documentation += `import type { ${exportName} as ${local} } from ${JSON.stringify(module)};\n`;
  };
  // The theme isn't imported by the deck, but may augment the types of
  // Seminar, e.g., with its slide masters.
  if (theme !== undefined) {
    documentation += `import type {} from ${JSON.stringify(theme)};\n`;
  }
  for (const [name, type] of Object.entries(BUILT_IN)) {
    if (name !== IMAGE_ATTRIBUTES) {
      document(name, '@seminar/core', type);
    }
  }
  for (const [name, { source: module, exportName }] of Object.entries(
    directives,
  )) {
    if (!Object.hasOwn(BUILT_IN, name)) {
      document(name, module, exportName);
    }
  }
  return {
    text: `${header}${code.text}${documentation}export {};\n`,
    documented,
    mappings: code.mappings.map((mapping) => ({
      ...mapping,
      generatedOffsets: mapping.generatedOffsets.map(
        (offset) => offset + header.length,
      ),
    })),
  };
}
