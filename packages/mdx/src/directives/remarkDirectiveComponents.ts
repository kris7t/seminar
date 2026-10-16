import type { Nodes, Root, RootContent } from 'mdast';
import type {
  ContainerDirective,
  LeafDirective,
  TextDirective,
} from 'mdast-util-directive';
import type {
  MdxJsxAttribute,
  MdxJsxFlowElement,
  MdxJsxTextElement,
} from 'mdast-util-mdx';
import type { VFile } from 'vfile';

import { createEsm, createStringAttribute } from '../utils/estree.ts';
import { EXPLICIT_JSX } from '../utils/jsx.ts';
import { getSliderConfigs } from '../config/remarkSliderConfig.ts';

/** A React component used to render a Remark directive. */
export interface DirectiveComponent {
  /** Module that exports the component. */
  source: string;
  /** Name of the component's export. */
  exportName: string;
}

/** Directive names and the React components that render them. */
export type DirectiveComponents = Record<string, DirectiveComponent>;

export interface RemarkDirectiveComponentsOptions {
  /** Components registered directly by the MDX integration. */
  directives?: DirectiveComponents | undefined;
}

type Directive = ContainerDirective | LeafDirective | TextDirective;

interface MutableParent {
  children: Nodes[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reads directive component registrations from an untrusted Slider config. */
export function parseDirectiveComponents(
  value: unknown,
  source: string,
  file: VFile,
): DirectiveComponents {
  if (value === undefined) {
    return {};
  }
  if (!isRecord(value)) {
    file.message(`Expected \`directives\` in ${source} to be an object`);
    return {};
  }
  const result: DirectiveComponents = {};
  for (const [name, descriptor] of Object.entries(value)) {
    if (
      !isRecord(descriptor) ||
      typeof descriptor['source'] !== 'string' ||
      descriptor['source'] === '' ||
      typeof descriptor['exportName'] !== 'string' ||
      descriptor['exportName'] === ''
    ) {
      file.message(
        `Expected the handler of the \`${name}\` directive in ${source} to have nonempty \`source\` and \`exportName\` strings`,
      );
      continue;
    }
    result[name] = {
      source: descriptor['source'],
      exportName: descriptor['exportName'],
    };
  }
  return result;
}

function attributesOf(directive: Directive): MdxJsxAttribute[] {
  return Object.entries(directive.attributes ?? {}).flatMap(([name, value]) =>
    value === null || value === undefined
      ? []
      : [createStringAttribute(name === 'class' ? 'className' : name, value)],
  );
}

function replaceDirectives(
  parent: MutableParent,
  components: DirectiveComponents,
  imports: Map<string, { local: string; component: DirectiveComponent }>,
): void {
  for (const [index, node] of parent.children.entries()) {
    if ('children' in node) {
      replaceDirectives(node, components, imports);
    }
    if (
      node.type !== 'textDirective' &&
      node.type !== 'leafDirective' &&
      node.type !== 'containerDirective'
    ) {
      continue;
    }
    const component = components[node.name];
    if (component === undefined) {
      continue;
    }
    const key = `${component.source}\0${component.exportName}`;
    let imported = imports.get(key);
    if (imported === undefined) {
      imported = {
        local: `_SliderDirective${String(imports.size)}`,
        component,
      };
      imports.set(key, imported);
    }
    const element = {
      type:
        node.type === 'textDirective'
          ? 'mdxJsxTextElement'
          : 'mdxJsxFlowElement',
      name: imported.local,
      attributes: attributesOf(node),
      children: node.children,
      data: EXPLICIT_JSX,
      position: node.position,
    } as MdxJsxFlowElement | MdxJsxTextElement;
    parent.children[index] = element;
  }
}

function applyDirectiveComponents(
  tree: Root,
  file: VFile,
  defaults: DirectiveComponents,
  entries: NonNullable<ReturnType<typeof getSliderConfigs>>,
): void {
  const components: DirectiveComponents = { ...defaults };
  for (const entry of entries) {
    Object.assign(
      components,
      parseDirectiveComponents(
        isRecord(entry.config) ? entry.config['directives'] : undefined,
        `the config of ${entry.source}`,
        file,
      ),
    );
  }
  const imports = new Map<
    string,
    { local: string; component: DirectiveComponent }
  >();
  replaceDirectives(tree, components, imports);
  const esm: RootContent[] = [...imports.values()].map(({ local, component }) =>
    createEsm(
      `import { ${component.exportName} as ${local} } from ${JSON.stringify(component.source)};`,
    ),
  );
  tree.children.unshift(...esm);
}

/**
 * Turns registered Remark directives into imported React components.
 * Registrations from previously loaded Slider configs are applied in order,
 * so the theme can replace components supplied by plugins.
 *
 * Must run after `remarkSlides`, which puts the whole deck below one root,
 * and `remarkSliderConfig`, which loads plugin and theme registrations.
 */
export function remarkDirectiveComponents({
  directives = {},
}: RemarkDirectiveComponentsOptions = {}): (tree: Root, file: VFile) => void {
  return (tree, file) => {
    applyDirectiveComponents(
      tree,
      file,
      directives,
      getSliderConfigs(file) ?? [],
    );
  };
}
