import type * as PrismNamespace from 'prismjs';
import type PrismIncludeLanguages from '@theme/prism-include-languages';
import prismIncludeLanguagesOriginal from '@theme-original/prism-include-languages';

const prismIncludeLanguages =
  prismIncludeLanguagesOriginal as typeof PrismIncludeLanguages;

// Prism has no grammar for MDX, so highlight it as Markdown.
export default function prismIncludeLanguagesWithMdx(
  PrismObject: typeof PrismNamespace,
): void {
  prismIncludeLanguages(PrismObject);
  PrismObject.languages['mdx'] = PrismObject.languages.extend('markdown', {});
}
