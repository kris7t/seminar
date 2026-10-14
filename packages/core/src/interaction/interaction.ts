/**
 * How an element on a slide interacts with the user, which determines which
 * navigation inputs it takes precedence over:
 *
 * - `'text'`: text entry, which uses all navigation keys.
 * - `'composite'`: widgets like sliders, radio groups, tabs, and menus, which
 *   use the arrow keys, Home, End, Page Up, and Page Down.
 * - `'activatable'`: links, buttons, and other focusable elements, which use
 *   Space and Enter.
 * - `'custom'`: elements marked with the `data-slider-interactive` attribute,
 *   which handle all input themselves.
 *
 * Clicks on any of these elements don't navigate.
 */
export type Interaction = 'text' | 'composite' | 'activatable' | 'custom';

/** Attribute that marks elements that handle all input themselves. */
export const INTERACTIVE_ATTRIBUTE = 'data-slider-interactive';

const ACTIVATABLE_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'file',
  'image',
  'reset',
  'submit',
]);

const COMPOSITE_INPUT_TYPES = new Set(['radio', 'range']);

const TEXT_ROLES = new Set(['combobox', 'searchbox', 'spinbutton', 'textbox']);

const COMPOSITE_ROLES = new Set([
  'grid',
  'listbox',
  'menu',
  'menubar',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'radio',
  'radiogroup',
  'slider',
  'tab',
  'tablist',
  'tree',
  'treegrid',
  'treeitem',
]);

const ACTIVATABLE_ROLES = new Set(['button', 'checkbox', 'link', 'switch']);

const ACTIVATABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button',
  'label',
  'summary',
  'iframe',
  'audio[controls]',
  'video[controls]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function classifyElement(element: Element): Interaction | undefined {
  if (element.hasAttribute(INTERACTIVE_ATTRIBUTE)) {
    return 'custom';
  }
  if (element instanceof HTMLInputElement) {
    if (ACTIVATABLE_INPUT_TYPES.has(element.type)) {
      return 'activatable';
    }
    return COMPOSITE_INPUT_TYPES.has(element.type) ? 'composite' : 'text';
  }
  if (
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement ||
    (element instanceof HTMLElement && element.isContentEditable)
  ) {
    return 'text';
  }
  const role = element.getAttribute('role');
  if (role !== null) {
    if (TEXT_ROLES.has(role)) {
      return 'text';
    }
    if (COMPOSITE_ROLES.has(role)) {
      return 'composite';
    }
    if (ACTIVATABLE_ROLES.has(role)) {
      return 'activatable';
    }
  }
  return element.matches(ACTIVATABLE_SELECTOR) ? 'activatable' : undefined;
}

/**
 * Returns how the closest interactive element containing `target` interacts
 * with the user, or `undefined` if `target` is not inside an interactive
 * element.
 */
export function getInteraction(
  target: EventTarget | null,
): Interaction | undefined {
  for (
    let element = target instanceof Element ? target : null;
    element !== null;
    element = element.parentElement
  ) {
    const interaction = classifyElement(element);
    if (interaction !== undefined) {
      return interaction;
    }
  }
  return undefined;
}

const COMPOSITE_KEYS = new Set([
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'End',
  'Home',
  'PageDown',
  'PageUp',
]);

const ACTIVATABLE_KEYS = new Set([' ', 'Enter']);

/** Returns whether an element with `interaction` uses `key` itself. */
export function usesKey(
  interaction: Interaction | undefined,
  key: string,
): boolean {
  switch (interaction) {
    case undefined:
      return false;
    case 'text':
    case 'custom':
      return true;
    case 'composite':
      return COMPOSITE_KEYS.has(key);
    case 'activatable':
      return ACTIVATABLE_KEYS.has(key);
  }
}
