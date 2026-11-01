import {
  compareDocumentOrder,
  isOverlay,
  type StepLayout,
} from './StepLayout.ts';
import type { StepNode, StepPath } from './StepNode.ts';

/** A step of a slide in the tree of its steps, see {@link computeStepTree}. */
export interface StepTreeEntry {
  /** The path that shows the step as the current one. */
  path: StepPath;
  /**
   * The title of the step, or the text shown by it, without the text of the
   * steps nested in it, or the empty string if it shows no text.
   */
  label: string;
  /** Whether a stepper of the step may cover other content. */
  overlay: boolean;
  /** The steps nested in the step. */
  children: readonly StepTreeEntry[];
}

/** Elements whose text isn't shown, or not as text. */
const TEXTLESS_SELECTOR =
  'annotation, script, style, template, [aria-hidden="true"]';

/**
 * Returns the text in `element`, collapsing whitespace, and leaving out the
 * elements for which `skip` returns `true`, along with their contents.
 */
function textIn(element: Element, skip: (element: Element) => boolean): string {
  const parts: string[] = [];
  const visit = (node: Node) => {
    if (node instanceof Element) {
      if (node.matches(TEXTLESS_SELECTOR) || skip(node)) {
        return;
      }
      for (const child of node.childNodes) {
        visit(child);
      }
    } else if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent ?? '');
    }
  };
  for (const child of element.childNodes) {
    visit(child);
  }
  return parts.join('').replaceAll(/\s+/g, ' ').trim();
}

/**
 * Returns the text that `element` of `node` shows, without the other steps
 * inside it, but with the content inside it that is part of what encloses it.
 */
function textOfElement(
  layout: StepLayout,
  node: StepNode,
  element: Element,
): string {
  return textIn(element, (descendant) => {
    const stepper = layout.stepperOf(descendant);
    return (
      stepper !== undefined &&
      stepper !== node &&
      !layout.aliasesParent(stepper)
    );
  });
}

/** Returns the text of the elements of `node`, in document order. */
function textOf(layout: StepLayout, node: StepNode): string {
  return [...node.elements.keys()]
    .sort(compareDocumentOrder)
    .map((element) => textOfElement(layout, node, element))
    .filter((text) => text !== '')
    .join(' ');
}

/**
 * Returns the texts shown by the step at `path`: the text of each element of
 * each stepper that shows it, without the steps nested in them, along with
 * which step of the stepper it is. Each element counts on its own, so that
 * steps still match in part if elements move between steppers.
 *
 * @returns The texts in order, or `undefined` if the step shows no text, or the
 *   slide has no such step.
 */
export function stepTextsOf(
  layout: StepLayout,
  path: StepPath,
): readonly string[] | undefined {
  const step = path.at(-1);
  if (step === undefined || step === 0) {
    return undefined;
  }
  const texts: string[] = [];
  for (const [node, { first, last }] of layout.steppersOn(path.slice(0, -1))) {
    if (step < first || step > last) {
      continue;
    }
    for (const element of node.elements.keys()) {
      const text = textOfElement(layout, node, element);
      if (text !== '') {
        texts.push(`${String(step - first)}\u0000${text}`);
      }
    }
  }
  return texts.length === 0 ? undefined : texts.sort();
}

/**
 * Returns the steps on `level` as a tree, where the steps on each level are
 * followed by the steps nested in them. Steps at step 0 of a level, which are
 * shown along with the level, have an entry first, whose path ends in 0, if
 * there are any.
 */
export function computeStepTree(
  layout: StepLayout,
  level: StepPath = [],
): StepTreeEntry[] {
  const size = layout.sizeOf(level);
  if (size === undefined) {
    return [];
  }
  const steppers = layout.steppersOn(level);
  const entries: StepTreeEntry[] = [];
  for (let step = 0; step <= size; step += 1) {
    const shown = steppers.filter(
      ([node, { first, last }]) =>
        first <= step &&
        step <= last &&
        // Joining steppers without a step aren't part of any entry.
        !layout.aliasesParent(node),
    );
    const path = [...level, step];
    const children = computeStepTree(layout, path);
    // Without other steps, a slide with step 0 alone has nothing to go to.
    if (
      step === 0 &&
      (shown.length === 0 ||
        (level.length === 0 && size === 0 && children.length === 0))
    ) {
      continue;
    }
    const labels = shown
      .map(([node, { anchor, first, last }]) => {
        const text = anchor.options.title?.trim() ?? textOf(layout, node);
        return last > first && text !== ''
          ? `${text} (${String(step - first + 1)}/${String(last - first + 1)})`
          : text;
      })
      .filter((label) => label !== '');
    entries.push({
      path,
      label: labels.join(' · '),
      overlay: shown.some(([node]) => isOverlay(node)),
      children,
    });
  }
  return entries;
}
