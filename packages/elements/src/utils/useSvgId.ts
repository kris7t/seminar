import { useId } from 'react';

/**
 * Returns an id unique to the component, made up of `prefix` and characters
 * that need no escaping in references like `url(#id)`.
 */
export function useSvgId(prefix: string): string {
  return `${prefix}-${useId().replace(/[^\w-]/g, '')}`;
}
