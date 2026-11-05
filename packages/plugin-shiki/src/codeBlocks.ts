import type { Element } from 'hast';
import type { CodeBlockHandlerFactory, ModuleExport } from '@seminar/mdx';

import type { CodeAttributes } from './Code.tsx';
import { readCodeOptions } from './codeOptions.ts';
import { highlight } from './highlight.ts';

const CODE: ModuleExport = {
  source: '@seminar/plugin-shiki',
  exportName: 'Code',
};

/** The code of a block in a plain `pre` element, as Markdown has it. */
function plainCode(code: string, lang: string | undefined): Element {
  return {
    type: 'element',
    tagName: 'pre',
    properties: {},
    children: [
      {
        type: 'element',
        tagName: 'code',
        properties:
          lang === undefined ? {} : { className: [`language-${lang}`] },
        children: [{ type: 'text', value: `${code}\n` }],
      },
    ],
  };
}

/**
 * Highlights the code blocks of decks with Shiki, which the `Code` component
 * of `@seminar/plugin-shiki` renders with the attributes after the language
 * (see {@link CodeAttributes}). Takes the `code` options of the Seminar
 * configs and the frontmatter (see {@link readCodeOptions}). Blocks that can't
 * be highlighted, e.g., in an unknown language, are reported, and shown as
 * plain text.
 *
 * Registered for the code blocks of all languages by the config of
 * `@seminar/plugin-shiki`.
 */
export const shikiCodeBlocks: CodeBlockHandlerFactory<CodeAttributes> = ({
  file,
}) => {
  let options: ReturnType<typeof readCodeOptions> | undefined;
  return async ({ code, lang, meta, props, place }) => {
    options ??= readCodeOptions(file);
    let rendered: Element | undefined;
    try {
      rendered = await highlight({ code, lang }, await options);
    } catch (error) {
      file.message(`Cannot highlight code: ${String(error)}`, { place });
    }
    return {
      component: CODE,
      props: {
        ...props,
        ...(lang === undefined ? {} : { lang }),
        ...(meta === undefined ? {} : { meta }),
        code,
      },
      children: [rendered ?? plainCode(code, lang)],
    };
  };
};
