import type { Alias } from 'vite';

/** Applies Vite's first matching alias, retaining bare package names for config lookup. */
export function resolveAlias(
  source: string,
  aliases: readonly Alias[],
): string {
  for (const { find, replacement } of aliases) {
    if (typeof find === 'string') {
      if (source === find || source.startsWith(`${find}/`))
        return source.replace(find, replacement);
    } else {
      const pattern = new RegExp(find);
      if (pattern.test(source))
        return source.replace(new RegExp(find), replacement);
    }
  }
  return source;
}
