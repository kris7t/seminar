import { describe, expect, it } from 'vitest';

import { previewHtml } from './previewPage.ts';

describe('previewHtml', () => {
  it('only allows framing the origin of the page', () => {
    const html = previewHtml(
      '/talk.deck.mdx',
      { page: 'http://127.0.0.1:1234/my%20talk.html?seminar-embedded' },
      'nonce',
    );
    expect(html).toContain('frame-src http://127.0.0.1:1234;');
    expect(html).toContain(
      '<iframe src="http://127.0.0.1:1234/my%20talk.html?seminar-embedded"',
    );
    expect(html).toContain('<script nonce="nonce">');
  });

  it('allows no frames for messages, and escapes them', () => {
    const html = previewHtml('/talk.deck.mdx', { message: '<b>&' }, 'nonce');
    expect(html).not.toContain('frame-src');
    expect(html).toContain('<p>&lt;b&gt;&amp;</p>');
  });

  it('saves the deck, whatever its path', () => {
    expect(
      previewHtml('/</script>.deck.mdx', { message: '' }, 'nonce'),
    ).toContain('setState({"deck":"/\\u003c/script>.deck.mdx"})');
  });
});
