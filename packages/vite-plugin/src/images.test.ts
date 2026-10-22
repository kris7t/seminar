import { describe, expect, it } from 'vitest';

import {
  imageReference,
  isImageFile,
  markedImages,
  resolveImages,
  type EmbeddedImage,
} from './images.ts';

const image: EmbeddedImage = {
  id: 'seminar-image-0',
  dataUri: 'data:image/png;base64,AA',
  width: 200,
  height: 100,
};

describe('isImageFile', () => {
  it('only matches images imported for their URL', () => {
    expect(isImageFile('/deck/arch.SVG')).toBe(true);
    expect(isImageFile('/deck/arch.svg?raw')).toBe(false);
    expect(isImageFile('\0virtual.png')).toBe(false);
    expect(isImageFile('/deck/theme.tsx')).toBe(false);
  });
});

describe('resolveImages', () => {
  const marker = (file: string) =>
    `seminar-asset:${encodeURIComponent(file).replaceAll("'", '%27')}`;

  it('replaces images and other references to them', () => {
    const file = "/deck/Bob's image.png";
    const html =
      `<p><img src="${marker(file)}" alt="Tom &amp; &quot;Jerry&quot;" width="50"/></p>` +
      `<div style="background:url(${marker(file)})"></div><img src="other.png"/>`;
    expect(markedImages(html)).toEqual([file]);
    expect(
      resolveImages(
        html,
        (found, attributes) =>
          `[${found}: ${attributes.get('alt') ?? ''} ${attributes.get('width') ?? ''}]`,
        (found) => `url-of-${found}`,
      ),
    ).toBe(
      `<p>[${file}: Tom & "Jerry" 50]</p>` +
        `<div style="background:url(url-of-${file})"></div><img src="other.png"/>`,
    );
  });
});

describe('imageReference', () => {
  it('uses the image with its alt text and size', () => {
    expect(imageReference(image, new Map([['alt', 'A <chart>']]))).toBe(
      '<svg role="img" aria-label="A &lt;chart&gt;" width="200" height="100" viewBox="0 0 200 100"><title>A &lt;chart&gt;</title><use href="#seminar-image-0"/></svg>',
    );
  });

  it('keeps the aspect ratio for a given width or height', () => {
    expect(imageReference(image, new Map([['width', '50']]))).toContain(
      'width="50" height="25"',
    );
    expect(imageReference(image, new Map([['height', '50']]))).toContain(
      'width="100" height="50"',
    );
  });

  it('hides decorative images', () => {
    expect(imageReference(image, new Map([['alt', '']]))).toBe(
      '<svg aria-hidden="true" width="200" height="100" viewBox="0 0 200 100"><use href="#seminar-image-0"/></svg>',
    );
  });
});
