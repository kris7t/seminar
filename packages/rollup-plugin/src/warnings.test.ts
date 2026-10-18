import { describe, expect, it } from 'vitest';

import slider from './index.ts';

describe('slider', () => {
  it('reports the warnings of compiling decks', async () => {
    const plugin = slider({ defaultTheme: false });
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
