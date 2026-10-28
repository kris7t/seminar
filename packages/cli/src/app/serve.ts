import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { net, protocol } from 'electron';

/** Scheme that serves the pages of decks, and the files that they load. */
export const SCHEME = 'seminar';

/** The preload script that gives decks their `seminarHost`. */
export const PRELOAD: string = fileURLToPath(
  new URL('./preload.cjs', import.meta.url),
);

/** Directories served, by the host of their URLs. */
export const roots: Map<string, string> = new Map<string, string>();

/** Registers the scheme, which has to happen before the app is ready. */
export function registerScheme(): void {
  // Unlike `file:`, served files can be modules, and fetched.
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);
}

function serve(request: Request): Promise<Response> | Response {
  const url = new URL(request.url);
  const root = roots.get(url.host);
  if (root === undefined) {
    return new Response(null, { status: 404 });
  }
  const file = path.join(root, decodeURIComponent(url.pathname));
  const relative = path.relative(root, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return new Response(null, { status: 404 });
  }
  return net
    .fetch(pathToFileURL(file).href)
    .catch(() => new Response(null, { status: 404 }));
}

/** Serves the directories in {@link roots}, once the app is ready. */
export function serveRoots(): void {
  protocol.handle(SCHEME, serve);
}

/** Returns the URL of `page` in the directory served at `host`. */
export function pageUrl(host: string, page: string): string {
  return `${SCHEME}://${host}/${page.split('/').map(encodeURIComponent).join('/')}`;
}
