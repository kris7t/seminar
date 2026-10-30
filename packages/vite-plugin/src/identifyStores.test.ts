import { describe, expect, it } from 'vitest';

import { identifyStores } from './identifyStores.ts';

const IMPORT = `import { defineSlideStore, defineDeckStore as deck } from '@seminar/core';\n`;

describe('identifyStores', () => {
  it('adds ids from the module and the variable of each store', () => {
    expect(
      identifyStores(
        `${IMPORT}const a = defineSlideStore({ initial: () => 'é' });
export const b = deck();
export default deck(options);
useStore(defineSlideStore());`,
        '/src/stores.ts?v=1',
      ),
    ).toBe(
      `${IMPORT}const a = defineSlideStore({ ...({ initial: () => 'é' }), id: "/src/stores.ts#a#1" });
export const b = deck({ id: "/src/stores.ts#b#1" });
export default deck({ ...(options), id: "/src/stores.ts#default#1" });
useStore(defineSlideStore({ id: "/src/stores.ts##1" }));`,
    );
  });

  it('tells apart stores of the same name', () => {
    const code = identifyStores(
      `${IMPORT}function f() { const a = deck(); } function g() { const a = deck(); }`,
      '/a.ts',
    );
    expect(code).toContain('"/a.ts#a#1"');
    expect(code).toContain('"/a.ts#a#2"');
  });

  it('keeps offsets after other characters outside the basic plane', () => {
    expect(
      identifyStores(`${IMPORT}const s = '😀é'; const a = deck();`, '/a.ts'),
    ).toBe(`${IMPORT}const s = '😀é'; const a = deck({ id: "/a.ts#a#1" });`);
  });

  it('leaves other modules alone', () => {
    expect(
      identifyStores('const a = defineSlideStore();', '/a.ts'),
    ).toBeUndefined();
    expect(
      identifyStores(
        `import { defineSlideStore } from 'other';\nimport '@seminar/core';\ndefineSlideStore();`,
        '/a.ts',
      ),
    ).toBeUndefined();
    expect(
      identifyStores(`@seminar/core { color: red }`, '/a.css'),
    ).toBeUndefined();
  });

  it('ignores calls of other functions and JSX in decks', () => {
    expect(
      identifyStores(`${IMPORT}const a = <b />; other();`, '/a.mdx'),
    ).toBeUndefined();
  });
});
