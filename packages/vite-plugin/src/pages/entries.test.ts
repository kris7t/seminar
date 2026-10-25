import {
  createServer as createHttpServer,
  request as httpRequest,
  type Server,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import {
  build,
  createLogger,
  createServer,
  defaultClientConditions,
  type InlineConfig,
  type Rolldown,
  type ViteDevServer,
} from 'vite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import seminar from '../index.ts';

const root = fileURLToPath(new URL('../test/fixtures', import.meta.url));

const pluginOptions = { plugins: ['@seminar/plugin-mathjax'] };

const config: InlineConfig = {
  root,
  configFile: false,
  logLevel: 'silent',
  plugins: [seminar(pluginOptions), react()],
  resolve: {
    conditions: ['@seminar/source', ...defaultClientConditions],
  },
};

/** Gets `path` from `server` as it is, unlike `fetch`, which normalizes it. */
function get(
  server: Server,
  path: string,
): Promise<{ status: number | undefined; body: string }> {
  const { port } = server.address() as AddressInfo;
  return new Promise((resolve, reject) => {
    httpRequest({ host: '127.0.0.1', port, path }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => {
        body += chunk;
      });
      response.on('end', () => {
        resolve({ status: response.statusCode, body });
      });
    })
      .on('error', reject)
      .end();
  });
}

/** Returns the colophon of `html`, with its lines joined. */
function colophonOf(html: string): string {
  return (
    /<p id="seminar-colophon" lang="en">([^]*?)<\/p>/.exec(html)?.[1] ?? ''
  ).replaceAll('\n', ' ');
}

/** Expects `html` to start with the fixture deck rendered as a document. */
function expectDocument(html: string) {
  const body = html.slice(html.indexOf('<body>'));
  // A link that skips the colophon, which tells tools where the content is,
  // under a label.
  expect(body).toMatch(
    /^<body>\s*<a id="seminar-skip" href="#seminar-main">Skip to content<\/a>\s*<div id="seminar-content">\n<details><summary>About this page<\/summary>\n<p id="seminar-colophon" lang="en">[^]*?<\/p>\n<\/details>\n<main id="seminar-main">/,
  );
  expect(colophonOf(body)).toMatch(
    /^A slide deck made with <a href="https:\/\/seminar\.run">Seminar<\/a>: <cite>A talk about slides<\/cite>, 4 slides\.<br> Slide content: <code>&lt;main&gt;<\/code> on lines \d+–\d+ up to <code>&lt;!--seminar-content-end--&gt;<\/code>, with a <code>&lt;section&gt;<\/code> for each slide, about the first \d+ KB\.<br> The <code>id<\/code> of the heading of each slide is its link in the deck, e\.g\., <code>#a-talk-about-slides<\/code>\.<br> Formulas: the slides have 1, each a MathML <code>&lt;math&gt;<\/code>/,
  );
  // Lines are broken at spaces, which mean the same.
  const content = body
    .slice(
      body.indexOf('</details>\n<main') + '</details>\n'.length,
      body.indexOf('<!--seminar-content-end-->'),
    )
    .replaceAll('\n', ' ');
  expect(content).toMatch(
    /^<main id="seminar-main"> ?<section data-seminar-slide=""> ?<h1 id="a-talk-about-slides">A <em>talk<\/em> about slides <a href="#a-talk-about-slides" aria-label="Link to this slide">#<\/a><\/h1> <p>Someone, somewhere<\/p><\/section> <section data-seminar-slide=""> ?<h4 id="introduction">/,
  );
  // Steps without their styles, and math without SVG.
  expect(content).toContain('<div>Revealed later</div>');
  expect(content).toContain('data-latex="e^{i\\pi} + 1 = 0"');
  expect(content).toContain(
    '<annotation encoding="application/x-tex">e^{i\\pi} + 1 = 0</annotation>',
  );
  expect(content).not.toContain('<svg');
  expect(content).toContain('<h2 id="results">Results ');
  // Slides without a title get one.
  expect(content).toContain('<h4 id="end">Slide 4 ');
  expect(content).not.toMatch(/<style|<!--| class=/);
}

/** Gets `paths` from a dev server with `options`. */
async function serve(
  options: InlineConfig,
  paths: readonly string[],
): Promise<string[]> {
  const server = await createServer({
    ...config,
    ...options,
    appType: 'mpa',
    server: { middlewareMode: true },
  });
  const httpServer = createHttpServer(server.middlewares);
  try {
    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', resolve);
    });
    const bodies: string[] = [];
    for (const path of paths) {
      bodies.push((await get(httpServer, path)).body);
    }
    return bodies;
  } finally {
    await new Promise((resolve) => httpServer.close(resolve));
    await server.close();
  }
}

describe('seminarEntries', () => {
  describe('build', () => {
    let output: Rolldown.RolldownOutput;

    beforeAll(async () => {
      const result = await build({ ...config, build: { write: false } });
      output = (Array.isArray(result) ? result[0] : result) as typeof output;
    }, 60_000);

    it('generates a page for each deck', () => {
      const page = output.output.find((file) => file.fileName === 'talk.html');
      expect(page?.type).toBe('asset');
      const html = page?.type === 'asset' ? String(page.source) : '';
      expect(html).toContain('<title>A talk about slides</title>');
      expect(html).toMatch(
        /<script type="module" crossorigin src="[^"]+\.js">/,
      );
    });

    it('starts the page with the deck as a document', () => {
      const page = output.output.find((file) => file.fileName === 'talk.html');
      expectDocument(page?.type === 'asset' ? String(page.source) : '');
    });

    it('bundles the deck', () => {
      expect(
        output.output.some((file) => file.type === 'chunk' && file.isEntry),
      ).toBe(true);
    });

    it('renders math with the font of the TypeScript theme', () => {
      const code = output.output
        .map((file) => (file.type === 'chunk' ? file.code : ''))
        .join('');
      expect(code).toMatch(/MJX-\d+-NCM-/);
      expect(code).not.toMatch(/MJX-\d+-STX-/);
    });
  });

  describe('dev server', () => {
    let server: ViteDevServer;
    let httpServer: Server;
    let baseUrl: string;

    beforeAll(async () => {
      server = await createServer({
        ...config,
        appType: 'mpa',
        server: { middlewareMode: true },
      });
      httpServer = createHttpServer(server.middlewares);
      await new Promise<void>((resolve) => {
        httpServer.listen(0, '127.0.0.1', resolve);
      });
      const { port } = httpServer.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${String(port)}`;
    });

    afterAll(async () => {
      await new Promise((resolve) => httpServer.close(resolve));
      await server.close();
    });

    it('serves a page for each deck', async () => {
      const response = await fetch(`${baseUrl}/talk.html`);
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain('<title>A talk about slides</title>');
      expect(html).toContain('src="./talk.deck.mdx?seminar-entry"');
      // The style of the focused link that skips to the content, which only
      // the rendered deck covers, is after the deck.
      expect(html).toMatch(
        /<div id="seminar-root"><\/div>\s*<div id="seminar-stylesheets">\s*<style>\s*#seminar-skip:focus \{/,
      );
      expect(html.slice(0, html.indexOf('<body>'))).not.toContain(
        'seminar-skip:focus',
      );
    });

    it('starts the page with the deck as a document', async () => {
      const response = await fetch(`${baseUrl}/talk.html`);
      expectDocument(await response.text());
    });

    it('serves the script that renders the deck', async () => {
      const response = await fetch(`${baseUrl}/talk.deck.mdx?seminar-entry`);
      expect(response.status).toBe(200);
      const code = await response.text();
      expect(code).toContain('createRoot');
      expect(code).toContain(
        '!matchMedia("(scripting: initial-only)").matches',
      );
      // A note on the rendered slides, which the page only has once they are.
      expect(code).toContain('seminar-colophon-rendered');
      // The link at the start of the page skips to the slides instead.
      expect(code).toContain('"#seminar-slides"');
      expect(code).toContain('talk.deck.mdx');
    });

    it('makes decks boundaries of React Fast Refresh', async () => {
      const response = await fetch(`${baseUrl}/talk.deck.mdx`);
      expect(response.status).toBe(200);
      const code = await response.text();
      expect(code).toContain('/@react-refresh');
      expect(code).toContain('import.meta.hot.accept(');
    });

    it('does not serve pages for other files', async () => {
      const response = await fetch(`${baseUrl}/missing.html`);
      expect(response.status).toBe(404);
    });

    it('does not serve pages outside of the root', async () => {
      // A sibling whose name starts with that of the root.
      const { status, body } = await get(
        httpServer,
        '/..%2ffixtures-sibling/outside.html',
      );
      expect(status).not.toBe(200);
      expect(body).not.toContain('Outside of the root');
    });

    it('answers malformed paths', async () => {
      const { status } = await get(httpServer, '/%E0.html');
      expect(status).toBe(404);
    });
  });

  describe('content', () => {
    it('falls back to the source of the deck with a warning', async () => {
      const warn = vi.fn<(message: string) => void>();
      const logger = createLogger('silent');
      logger.warn = warn;
      const [html] = await serve(
        {
          root: fileURLToPath(
            new URL('../test/fixtures-broken', import.meta.url),
          ),
          customLogger: logger,
          logLevel: 'warn',
        },
        ['/broken.html'],
      );
      expect(html).toMatch(
        /<div id="seminar-content">\n<details><summary>About this page<\/summary>\n<p id="seminar-colophon" lang="en">[^]*?<\/p>\n<\/details>\n<main id="seminar-main"><pre>\nexport function Broken\(\)/,
      );
      expect(colophonOf(html ?? '')).toMatch(
        /^A slide deck made with <a href="https:\/\/seminar\.run">Seminar<\/a>: <cite>A broken talk<\/cite>\.<br> The MDX source of the deck: <code>&lt;main&gt;<\/code> on lines \d+–\d+ up to <code>&lt;!--seminar-content-end--&gt;<\/code>, about the first \d+ KB\.$/,
      );
      expect(warn).toHaveBeenCalledWith(
        expect.stringMatching(
          /broken\.deck\.mdx could not be rendered as a document.*Broken on purpose/,
        ),
      );
    });

    it('can be the source of the deck', async () => {
      const [html, entry] = await serve(
        {
          plugins: [seminar({ ...pluginOptions, content: 'source' }), react()],
        },
        ['/talk.html', '/talk.deck.mdx?seminar-entry'],
      );
      expect(html).toMatch(
        /<div id="seminar-content">\n<details><summary>About this page<\/summary>\n<p id="seminar-colophon" lang="en">[^]*?<\/p>\n<\/details>\n<main id="seminar-main"><pre>\n---\nmouseNavigation: false\n/,
      );
      expect(html).toContain('&lt;Step&gt;Revealed later&lt;/Step&gt;');
      expect(html).toContain('{/* Not for the audience */}');
      expect(entry).toContain('scripting: initial-only');
    });

    it('can be the source of the deck as Markdown', async () => {
      const [html, entry] = await serve(
        {
          plugins: [
            seminar({ ...pluginOptions, content: 'markdown' }),
            react(),
          ],
        },
        ['/talk.html', '/talk.deck.mdx?seminar-entry'],
      );
      expect(html).toContain(
        'Someone, somewhere\n\n## Introduction\n\n&lt;Step&gt;Revealed later&lt;/Step&gt;',
      );
      expect(html).not.toContain('Not for the audience');
      expect(colophonOf(html ?? '')).toMatch(
        /^A slide deck made with <a href="https:\/\/seminar\.run">Seminar<\/a>: <cite>A talk about slides<\/cite>\.<br> The Markdown source of the deck, without comments and with the slides it includes from other decks: <code>&lt;main&gt;<\/code> on lines \d+–\d+/,
      );
      expect(entry).toContain('scripting: initial-only');
    });

    it('can be left out', async () => {
      const [html, entry] = await serve(
        { plugins: [seminar({ ...pluginOptions, content: 'none' }), react()] },
        ['/talk.html', '/talk.deck.mdx?seminar-entry'],
      );
      expect(html).not.toContain('seminar-content');
      expect(html).not.toContain('scripting');
      expect(html).toMatch(
        /<body>\s*<a id="seminar-skip" href="#seminar-slides">Skip to content<\/a>\s*<div id="seminar-root">/,
      );
      // The deck is rendered wherever scripts run.
      expect(entry).toContain('createRoot');
      expect(entry).not.toContain('matchMedia');
    });
  });
});
