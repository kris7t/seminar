import type { SequenceModel } from 'pele';

import {
  emptyItems,
  isStatement,
  parseAlone,
  type Adapter,
  type Items,
  type Line,
} from './source.ts';
import {
  BLOCK_ENDS,
  BLOCK_STARTS,
  messageId,
  NOTE,
  WITHOUT_ELEMENTS,
} from '../sequenceMessages.ts';

function hasElements(type: number | undefined): boolean {
  return (
    type === undefined || (!BLOCK_ENDS.has(type) && !WITHOUT_ELEMENTS.has(type))
  );
}

function itemsOf(model: SequenceModel): Items {
  const items = emptyItems();
  for (const [id, actor] of model.actors) {
    items.labels.set(id, actor.description || actor.name || id);
  }
  const blocks: string[] = [];
  for (const message of model.messages) {
    const { type, from, to } = message;
    const id = messageId(message.id);
    const text = typeof message.message === 'string' ? message.message : '';
    if (type !== undefined && BLOCK_ENDS.has(type)) {
      blocks.pop();
      continue;
    }
    if (!hasElements(type)) {
      continue;
    }
    const block = blocks.at(-1);
    if (block !== undefined) {
      items.parents.set(id, block);
    }
    const kind = type === undefined ? undefined : BLOCK_STARTS.get(type);
    if (kind !== undefined) {
      items.labels.set(id, text === '' ? kind : `${kind} ${text}`);
      blocks.push(id);
    } else {
      items.labels.set(id, text || `${from ?? ''} → ${to ?? ''}`);
      if (type !== NOTE && from !== undefined && to !== undefined) {
        items.ends.set(id, [from, to]);
      }
    }
  }
  return items;
}

/**
 * Finds what each statement line is about. Messages are numbered along with
 * every statement, e.g., of blocks and activations, so a statement parsed
 * alone tells how many numbers it takes, but not where they start.
 *
 * @returns `undefined` if the numbers don't add up, e.g., because a
 *   statement can't be parsed alone.
 */
function statementsOf(
  model: SequenceModel,
  header: string,
  lines: readonly Line[],
): Map<number, string[] | undefined> | undefined {
  const result = new Map<number, string[] | undefined>();
  // Whether the blocks around a statement are blocks, rather than boxes,
  // whose ends are statements that take a number.
  const blocks: boolean[] = [];
  let next = 0;
  for (const line of lines.filter(isStatement)) {
    const text = line.text.trim();
    if (/^end\b/.test(text)) {
      next += blocks.pop() === true ? 1 : 0;
      continue;
    }
    if (/^(?:else|and|option)\b/.test(text)) {
      next += 1;
      continue;
    }
    const statement = parseAlone(header, text, 'sequence', ['', '\nend']);
    if (statement === undefined) {
      return undefined;
    }
    const { messages } = statement;
    const first = messages[0]?.type;
    const opens = first !== undefined && BLOCK_STARTS.has(first);
    if (/^box\b/.test(text)) {
      blocks.push(false);
    } else if (opens) {
      blocks.push(true);
    }
    // The end that closes a block that the statement opens comes later.
    const count = opens ? messages.length - 1 : messages.length;
    const ids = messages
      .slice(0, count)
      .filter(({ type }) => hasElements(type))
      .map(({ id }) => messageId(next + Number(id)));
    result.set(
      line.index,
      /^(?:create\s+)?(?:participant|actor)\b/.test(text)
        ? [...statement.actors.keys()]
        : ids,
    );
    next += count;
  }
  return next === model.messages.length ? result : undefined;
}

/**
 * Steps of the items of sequence diagrams. A statement is about its messages
 * or notes, the participant that it declares, or the block that it opens,
 * e.g., `loop`, whose messages are in it.
 */
export function sequenceAdapter(
  model: SequenceModel,
  header: string,
  lines: readonly Line[],
): Adapter {
  const statements = statementsOf(model, header, lines);
  return {
    items: itemsOf(model),
    about: (line) => statements?.get(line.index),
    // Participants, e.g., `participant A@{ … }`.
    shapeDataItem: (_line, before) => /[\w-]+$/.exec(before)?.[0],
  };
}
