/** The query of pages that the dev server tells that they are embedded. */
export const EMBEDDED_QUERY = '?seminar-embedded';

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** What a panel shows. */
export type PreviewContent =
  | { message: string }
  /** The page of a deck at this URL. */
  | { page: string };

/**
 * Returns the HTML of the panel previewing `deck`, which saves the deck for
 * when the window is reloaded, with the script that has the nonce `nonce`.
 */
export function previewHtml(
  deck: string,
  content: PreviewContent,
  nonce: string,
): string {
  const frameSource =
    'page' in content ? `frame-src ${new URL(content.page).origin}; ` : '';
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; ${frameSource}style-src 'unsafe-inline'; script-src 'nonce-${nonce}';"
    />
    <style>
      html, body, iframe { width: 100%; height: 100%; margin: 0; padding: 0; border: 0; overflow: hidden; }
      p { padding: 1em; }
    </style>
  </head>
  <body>
    ${
      'page' in content
        ? `<iframe src="${escapeHtml(content.page)}" allow="autoplay; clipboard-read; clipboard-write"></iframe>`
        : `<p>${escapeHtml(content.message)}</p>`
    }
    <script nonce="${nonce}">
      acquireVsCodeApi().setState(${JSON.stringify({ deck }).replaceAll('<', '\\u003c')});
    </script>
  </body>
</html>
`;
}
