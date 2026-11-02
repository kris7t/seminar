/** The query of the pages of decks shown in a frame of another application. */
export const EMBEDDED_QUERY = 'seminar-embedded';

/** The name of the channel between pages and the dev server. */
const CHANNEL_EVENT = 'seminar:channel';

/** The module that gives pages the channel to the dev server. */
const CHANNEL_MODULE = 'virtual:seminar-dev-channel';

/** How Vite calls modules without a file: not a URL that can be requested. */
const RESOLVED_CHANNEL_MODULE = `\0${CHANNEL_MODULE}`;

/**
 * Pages get the channel from this module, rather than from `@seminar/core`,
 * because Vite only makes `import.meta.hot` work in modules that it doesn't
 * bundle ahead of time, unlike installed packages. See `DevChannel` there.
 */
const CHANNEL_SOURCE = `if (import.meta.hot) {
  const { hot } = import.meta;
  const page = location.pathname;
  const listeners = new Map();
  hot.on(${JSON.stringify(CHANNEL_EVENT)}, (message) => {
    if (message.page === page) {
      for (const listener of listeners.get(message.event) ?? []) {
        listener(message.data);
      }
    }
  });
  globalThis[Symbol.for('seminar.devChannel')] = {
    send(event, data) {
      hot.send(${JSON.stringify(CHANNEL_EVENT)}, { page, event, data });
    },
    on(event, listener) {
      const own = listeners.get(event) ?? new Set();
      listeners.set(event, own);
      own.add(listener);
      return () => {
        own.delete(listener);
      };
    },
  };
}
`;

/** The event that tells that no page shows a deck anymore. */
const PAGE_CLOSED = 'pageClosed';

const PAGE_CLOSED_VERSION = 1;

/** A message between a page of a deck and the editor. */
export interface ChannelMessage {
  /** The path of the page, from its URL. */
  page: string;
  event: string;
  data: unknown;
}

/** The hot channel of Vite. */
interface ViteHotChannel<Client> {
  clients: { size: number } & Iterable<Client>;
  on: {
    (
      event: 'vite:client:connect' | 'vite:client:disconnect',
      listener: () => void,
    ): void;
    (event: string, listener: (data: never, client: Client) => void): void;
  };
  send: (event: string, data: unknown) => void;
}

interface ViteHotClient {
  send: (event: string, data: unknown) => void;
}

/** What we need from a dev server of Vite. */
interface ViteDevServer {
  config: { base: string };
  ws: ViteHotChannel<ViteHotClient>;
}

/** A tag that Vite adds to a page. */
type HtmlTag = {
  tag: string;
  injectTo: 'head-prepend';
} & ({ children: string } | { attrs: Record<string, string> });

/** The plugin of Vite for the dev server of the command line. */
export interface DevServerPlugin {
  name: string;
  configureServer: (server: ViteDevServer) => void;
  resolveId: (id: string) => string | undefined;
  load: (id: string) => string | undefined;
  transformIndexHtml: (
    html: string,
    context: { originalUrl?: string },
  ) => HtmlTag[];
  /** Sends a message to the pages that it is for. */
  sendToPages: (message: ChannelMessage) => void;
}

/** What the plugin tells about pages. */
export interface DevServerPluginEvents {
  /** Called with the number of pages connected to the dev server. */
  onPages: (count: number) => void;
  /** Called with what pages send over their channel. */
  onChannel: (message: ChannelMessage) => void;
}

/**
 * Creates the plugin of Vite that
 *
 * - tells with `onPages` how many pages are connected to the dev server, and
 *   does so again after Vite restarts, e.g., because its config has changed,
 *   which it calls the plugin for;
 * - gives pages a channel to the editor, which also reaches the other pages of
 *   the deck, and tells the editor when no page shows a deck anymore;
 * - tells the pages with {@link EMBEDDED_QUERY} that they are embedded, since
 *   the applications that show them in a frame of another origin can't.
 */
export function devServerPlugin({
  onPages,
  onChannel,
}: DevServerPluginEvents): DevServerPlugin {
  let hot: ViteHotChannel<ViteHotClient> | undefined;
  let base = '/';
  // The pages that have used their channel, which tells what they show.
  const pages = new Map<ViteHotClient, string>();
  const forgetPages = (connected: (client: ViteHotClient) => boolean) => {
    for (const [client, page] of pages) {
      if (!connected(client)) {
        pages.delete(client);
        if (![...pages.values()].includes(page)) {
          onChannel({
            page,
            event: PAGE_CLOSED,
            data: { version: PAGE_CLOSED_VERSION },
          });
        }
      }
    }
  };
  return {
    name: 'seminar:dev-server',
    configureServer({ config, ws }) {
      hot = ws;
      ({ base } = config);
      // Pages connect again after Vite restarts.
      forgetPages(() => false);
      const report = () => {
        onPages(ws.clients.size);
        const connected = new Set(ws.clients);
        forgetPages((client) => connected.has(client));
      };
      ws.on('vite:client:connect', report);
      ws.on('vite:client:disconnect', report);
      ws.on(CHANNEL_EVENT, (message: ChannelMessage, sender: ViteHotClient) => {
        pages.set(sender, message.page);
        onChannel(message);
        for (const client of ws.clients) {
          if (client !== sender) {
            client.send(CHANNEL_EVENT, message);
          }
        }
      });
      report();
    },
    resolveId(id) {
      return id === CHANNEL_MODULE ? RESOLVED_CHANNEL_MODULE : undefined;
    },
    load(id) {
      return id === RESOLVED_CHANNEL_MODULE ? CHANNEL_SOURCE : undefined;
    },
    transformIndexHtml(_html, { originalUrl }) {
      const embedded = new URL(
        originalUrl ?? '',
        'http://localhost',
      ).searchParams.has(EMBEDDED_QUERY);
      return [
        ...(embedded
          ? [
              {
                tag: 'script',
                children: 'window.seminarHost = { embedded: true };',
                injectTo: 'head-prepend' as const,
              },
            ]
          : []),
        {
          tag: 'script',
          attrs: {
            type: 'module',
            src: `${base}@id/__x00__${CHANNEL_MODULE}`,
          },
          injectTo: 'head-prepend' as const,
        },
      ];
    },
    sendToPages(message) {
      hot?.send(CHANNEL_EVENT, message);
    },
  };
}
