/**
 * Classes of the elements that stand for the items of diagrams, by
 * precedence: a node rather than, e.g., the lifeline of a participant, or an
 * edge rather than its label, which have the same `data-id`.
 */
const ITEM_CLASSES = ['pele-node', 'pele-cluster', 'pele-edge'];

function rankOf(element: Element): number {
  const rank = ITEM_CLASSES.findIndex((name) =>
    element.classList.contains(name),
  );
  return (
    (rank === -1 ? ITEM_CLASSES.length : rank) +
    // Participants of sequence diagrams are drawn at the bottom, too.
    (element.classList.contains('pele-actor-footer') ? 0.5 : 0)
  );
}

/**
 * Returns the elements of the items of a diagram that Pele rendered in
 * `root`, by their ids in the diagram, i.e., their `data-id`: e.g., nodes,
 * clusters, and edges with ids, like `e1` in `A e1@--> B`.
 */
export function findItems(root: Element): Map<string, Element> {
  const items = new Map<string, { element: Element; rank: number }>();
  for (const element of root.querySelectorAll('[data-id]')) {
    const id = element.getAttribute('data-id') ?? '';
    const rank = rankOf(element);
    const found = items.get(id);
    if (found === undefined || rank < found.rank) {
      items.set(id, { element, rank });
    }
  }
  return new Map([...items].map(([id, { element }]) => [id, element]));
}
