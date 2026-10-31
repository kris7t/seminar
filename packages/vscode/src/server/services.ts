import { createMdxServicePlugin } from '@mdx-js/language-service';
import type { LanguageServicePlugin } from '@volar/language-server';
import { create as createMarkdownServicePlugin } from 'volar-service-markdown';
import { create as createTypeScriptServicePlugin } from 'volar-service-typescript';

/**
 * Creates the language service plugins of decks.
 *
 * Language clients register the commands of their servers in the editor, where
 * commands must have unique names, so the commands of the language service of
 * MDX would fail to initialize next to the MDX extension. They only toggle
 * formatting from the keybindings of that extension.
 */
export function createDeckServicePlugins(
  typescript: Parameters<typeof createTypeScriptServicePlugin>[0],
  workspace: Parameters<typeof createMdxServicePlugin>[0],
): LanguageServicePlugin[] {
  const mdx = createMdxServicePlugin(workspace);
  return [
    createMarkdownServicePlugin(),
    {
      ...mdx,
      capabilities: {
        ...mdx.capabilities,
        executeCommandProvider: { commands: [] },
      },
    },
    ...createTypeScriptServicePlugin(typescript, {}),
  ];
}
