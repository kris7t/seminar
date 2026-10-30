import { createFilter, type FilterPattern, type Plugin } from 'vite';

import { identifyStores } from './identifyStores.ts';

/** The plugin of `@vitejs/plugin-react` that serves its refresh runtime. */
const REACT_REFRESH_PLUGIN = 'vite:react-refresh';

/** Where `@vitejs/plugin-react` serves the runtime of React Fast Refresh. */
const REACT_REFRESH_RUNTIME = '/@react-refresh';

/**
 * Appends to the compiled deck at `id` the code that makes it a boundary of
 * React Fast Refresh.
 */
function renderRefreshWrapper(id: string): string {
  const deck = JSON.stringify(id);
  return `
import * as __seminarRefreshRuntime from ${JSON.stringify(REACT_REFRESH_RUNTIME)};
import * as __seminarDeckExports from ${deck};
if (import.meta.hot && window.$RefreshReg$) {
  // Slides that fail after a hot update reset their state, see \`@seminar/core\`.
  import.meta.hot.on('vite:beforeUpdate', () => {
    const updates = Symbol.for('seminar.hotUpdates');
    globalThis[updates] = (globalThis[updates] ?? 0) + 1;
  });
  const register = (exports) => {
    for (const [name, value] of Object.entries(exports)) {
      if (typeof value === 'function') {
        __seminarRefreshRuntime.register(value, ${deck} + ' export ' + name);
      }
    }
  };
  queueMicrotask(() => {
    register(__seminarDeckExports);
    import.meta.hot.accept((nextExports) => {
      if (!nextExports) return;
      register(nextExports);
      const invalidateMessage =
        __seminarRefreshRuntime.validateRefreshBoundaryAndEnqueueUpdate(
          ${deck},
          { default: __seminarDeckExports.default },
          { default: nextExports.default },
        );
      if (invalidateMessage) import.meta.hot.invalidate(invalidateMessage);
    });
  });
}
`;
}

/**
 * Updates decks in place when they change in the dev server, instead of
 * reloading the page, so that the deck keeps its state, like the current
 * slide, the open sidebar, the overview, the presenter view, and the state of
 * its slides.
 *
 * Decks become boundaries of React Fast Refresh, which needs
 * `@vitejs/plugin-react`. The slides and other components of a deck are named
 * so that the refresh runtime doesn't take them for components, so they are
 * registered by hand. Without the plugin, changed decks reload the page.
 *
 * Stores get ids, so that they keep their values when their definitions are
 * evaluated again (see {@link identifyStores}).
 */
export function seminarHotReload({
  include = /\.deck\.mdx$/,
}: { include?: FilterPattern | undefined } = {}): Plugin {
  const isDeck = createFilter(include);
  let enabled = false;
  return {
    name: 'seminar:hot-reload',
    apply: 'serve',

    configResolved(config) {
      enabled =
        !config.isProduction &&
        config.server.hmr !== false &&
        config.plugins.some((plugin) => plugin.name === REACT_REFRESH_PLUGIN);
    },

    transform(code, id) {
      if (!enabled || this.environment.config.consumer !== 'client') {
        return undefined;
      }
      const identified = identifyStores(code, id);
      if (!isDeck(id)) {
        return identified === undefined
          ? undefined
          : { code: identified, map: null };
      }
      return {
        code: (identified ?? code) + renderRefreshWrapper(id),
        map: null,
      };
    },
  };
}
