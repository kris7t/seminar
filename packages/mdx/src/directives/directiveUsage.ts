import type {
  ContainerDirective,
  LeafDirective,
  TextDirective,
} from 'mdast-util-directive';

type Directive = ContainerDirective | LeafDirective | TextDirective;

/** How a directive is written: `:name`, `::name`, or `:::name`. */
export type DirectiveForm = 'text' | 'leaf' | 'container';

/** The forms of the types of directive nodes. */
export const DIRECTIVE_FORMS: Readonly<
  Record<Directive['type'], DirectiveForm>
> = {
  textDirective: 'text',
  leafDirective: 'leaf',
  containerDirective: 'container',
};

/** The colons that the forms of directives start with. */
export const FORM_PREFIXES: Readonly<Record<DirectiveForm, string>> = {
  text: ':',
  leaf: '::',
  container: ':::',
};

/** How a directive can be written, see `DirectiveComponentConfig`. */
export interface DirectiveUsage {
  forms?: readonly DirectiveForm[] | undefined;
  content?: boolean | undefined;
  labelProp?: string | undefined;
}

/**
 * Whether the directive `node` has content, which becomes the children of its
 * component: the label of text and leaf directives, and the body of container
 * directives, without the label if it goes to `labelProp`.
 */
export function hasContent(
  node: Directive,
  labelProp: string | undefined,
): boolean {
  if (node.type !== 'containerDirective' || labelProp === undefined) {
    return node.children.length > 0;
  }
  return node.children.some(
    (child) => !(child.type === 'paragraph' && child.data?.directiveLabel),
  );
}

/**
 * Returns the problems with how the directive `node` is written, as `usage`
 * tells: in a form it can't be written in, or without content it needs, or
 * with content it doesn't take.
 */
export function directiveUsageMessages(
  node: Directive,
  { forms, content, labelProp }: DirectiveUsage,
): string[] {
  const form = DIRECTIVE_FORMS[node.type];
  const syntax = `${FORM_PREFIXES[form]}${node.name}`;
  if (forms !== undefined && !forms.includes(form)) {
    const alternatives = forms
      .map((other) => `\`${FORM_PREFIXES[other]}${node.name}\``)
      .join(' or ');
    return [
      `The \`${node.name}\` directive can't be written as \`${syntax}\`; write ${alternatives}`,
    ];
  }
  if (content === true && !hasContent(node, labelProp)) {
    return [`The \`${syntax}\` directive needs content`];
  }
  if (content === false && hasContent(node, labelProp)) {
    return [`The \`${syntax}\` directive takes no content`];
  }
  return [];
}
