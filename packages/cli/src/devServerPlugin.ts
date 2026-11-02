/** The query of the pages of decks shown in a frame of another application. */
export const EMBEDDED_QUERY = 'seminar-embedded';

/** What we need from a dev server of Vite. */
interface ViteDevServer {
  ws: {
    clients: { size: number };
    on: (event: string, listener: () => void) => void;
  };
}

/** A tag that Vite adds to a page. */
interface HtmlTag {
  tag: string;
  children: string;
  injectTo: 'head-prepend';
}

/** The plugin of Vite for the dev server of the command line. */
export interface DevServerPlugin {
  name: string;
  configureServer: (server: ViteDevServer) => void;
  transformIndexHtml: (
    html: string,
    context: { originalUrl?: string },
  ) => HtmlTag[] | undefined;
}

/**
 * Creates the plugin of Vite that
 *
 * - calls `onPages` with the number of pages connected to the dev server, and
 *   does so again after Vite restarts, e.g., because its config has changed,
 *   which it calls the plugin for;
 * - tells the pages with {@link EMBEDDED_QUERY} that they are embedded, since
 *   the applications that show them in a frame of another origin can't.
 */
export function devServerPlugin(
  onPages: (count: number) => void,
): DevServerPlugin {
  return {
    name: 'seminar:dev-server',
    configureServer({ ws }) {
      const report = () => {
        onPages(ws.clients.size);
      };
      ws.on('vite:client:connect', report);
      ws.on('vite:client:disconnect', report);
      report();
    },
    transformIndexHtml(_html, { originalUrl }) {
      return new URL(originalUrl ?? '', 'http://localhost').searchParams.has(
        EMBEDDED_QUERY,
      )
        ? [
            {
              tag: 'script',
              children: 'window.seminarHost = { embedded: true };',
              injectTo: 'head-prepend',
            },
          ]
        : undefined;
    },
  };
}
