/** Joins the given class names, skipping `undefined` and empty ones. */
export function classNames(...names: (string | undefined)[]): string {
  return names.filter((name) => name !== undefined && name !== '').join(' ');
}
