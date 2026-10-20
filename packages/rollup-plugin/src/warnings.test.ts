import { describe, expect, it } from 'vitest';

import seminar from './index.ts';

describe('seminar', () => {
  it('reports the warnings of compiling decks', async () => {
    const plugin = seminar({ defaultTheme: false });
    const warnings: unknown[] = [];
    await plugin.transform.call(
      {
        addWatchFile() {
          // Nothing to watch.
        },
        warn(warning: unknown) {
          warnings.push(warning);
        },
      },
      '## Slide\n\n:step{with=sometimes} Text',
      '/decks/test.deck.mdx',
    );
    expect(warnings).toEqual([
      {
        message: expect.stringContaining('`with=sometimes`') as unknown,
      },
    ]);
  });
});
