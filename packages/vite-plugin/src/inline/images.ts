import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { imageSize } from 'image-size';
import type { Plugin } from 'vite';

/** Prefix of the markers that documents have instead of the URLs of images. */
const MARKER = 'seminar-asset:';

/**
 * Prefix of the markers that the Markdown of decks has instead of the URLs of
 * images, which refer to the images embedded into the page by their ids.
 */
const REFERENCE_MARKER = 'seminar-asset-reference:';

/**
 * Finds the markers of images, whose paths are encoded with {@link mark}, and
 * whether they are references.
 */
const MARKER_PATTERN = /seminar-asset(-reference)?:([\w.~%-]+)/g;

/** Media types of the images that documents may refer to, by extension. */
const IMAGE_TYPES: Readonly<Record<string, string>> = {
  '.apng': 'image/apng',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.jfif': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

/** Returns the name of the type of the image at `file`, e.g., `PNG`. */
export function imageTypeName(file: string): string {
  const type = IMAGE_TYPES[path.extname(file).toLowerCase()] ?? '';
  const subtype = type.slice(type.indexOf('/') + 1).replace(/^x-|\+xml$/g, '');
  return subtype.toUpperCase();
}

/** Whether the module `id` is an image file imported for its URL. */
export function isImageFile(id: string): boolean {
  return (
    !id.startsWith('\0') &&
    !id.includes('?') &&
    Object.hasOwn(IMAGE_TYPES, path.extname(id).toLowerCase())
  );
}

/** Returns the marker of the image at `file`, without characters to escape. */
function mark(file: string, prefix = MARKER): string {
  return (
    prefix +
    encodeURIComponent(file).replaceAll(
      /[!'()*]/g,
      (character) =>
        `%${(character.codePointAt(0) ?? 0).toString(16).toUpperCase()}`,
    )
  );
}

/**
 * Returns the marker of a reference to the image at `file`, which
 * {@link resolveImages} replaces with a link to the image embedded into the
 * page, without characters to escape.
 */
export function markReference(file: string): string {
  return mark(file, REFERENCE_MARKER);
}

/**
 * Makes images evaluate to markers of their files instead of URLs, so that
 * the documents rendered while building refer to them however the build
 * embeds them (see {@link resolveImages}).
 */
export function imageMarkers(): Plugin {
  return {
    name: 'seminar:image-markers',
    enforce: 'pre',
    load(id) {
      return isImageFile(id)
        ? `export default ${JSON.stringify(mark(id))};`
        : undefined;
    },
  };
}

/**
 * Returns the files of the images that `html` has markers of, or only those
 * that it has markers of references to, or of other markers.
 */
export function markedImages(html: string, references?: boolean): string[] {
  return [
    ...new Set(
      [...html.matchAll(MARKER_PATTERN)].flatMap(([, reference, file = '']) =>
        references === undefined || references === (reference !== undefined)
          ? [decodeURIComponent(file)]
          : [],
      ),
    ),
  ];
}

function escapeAttribute(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function unescapeAttribute(text: string): string {
  return text.replaceAll(
    /&(amp|lt|gt|quot|#x27|#39);/g,
    (_, entity: string) =>
      ({ amp: '&', lt: '<', gt: '>', quot: '"', '#x27': "'", '#39': "'" })[
        entity
      ] ?? '',
  );
}

/** The attributes of an `img` element of a document. */
export type ImageAttributes = ReadonlyMap<string, string>;

/** How many images a document shows, and how many have no alt text. */
export interface ImageCounts {
  count: number;
  withoutAlt: number;
}

/** Counts the image with `attributes` in `counts`. */
export function countImage(
  counts: ImageCounts,
  attributes: ImageAttributes,
): void {
  counts.count += 1;
  if ((attributes.get('alt') ?? '') === '') {
    counts.withoutAlt += 1;
  }
}

/**
 * Replaces the markers of images in `html`: `img` elements with markers as
 * their `src` with what `element` returns, references (see
 * {@link markReference}) with what `reference` returns, or else `url`, and
 * other markers, e.g., in styles, with what `url` returns. The documents
 * rendered by React have their attributes in double quotes.
 */
export function resolveImages(
  html: string,
  element: (file: string, attributes: ImageAttributes) => string,
  url: (file: string) => string,
  reference: (file: string) => string = url,
): string {
  return html
    .replaceAll(/<img\b([^>]*?)\/?>/g, (tag, attributeText: string) => {
      const attributes = new Map(
        [...attributeText.matchAll(/\s([\w-]+)="([^"]*)"/g)].map(
          ([, name = '', value = '']) => [name, unescapeAttribute(value)],
        ),
      );
      const [file] = markedImages(attributes.get('src') ?? '');
      return file === undefined ? tag : element(file, attributes);
    })
    .replaceAll(
      MARKER_PATTERN,
      (_, isReference: string | undefined, file: string) =>
        (isReference === undefined ? url : reference)(decodeURIComponent(file)),
    );
}

function dataUri(file: string, data: Buffer): string {
  const type =
    IMAGE_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
  return `data:${type};base64,${data.toString('base64')}`;
}

/** Returns an `img` element with `attributes` and `src` instead. */
export function imageElement(src: string, attributes: ImageAttributes): string {
  return `<img src="${escapeAttribute(src)}"${[...attributes]
    .filter(([name]) => name !== 'src')
    .map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`)
    .join('')}/>`;
}

/** Reads the image at `file` as a data URI. */
export async function readDataUri(file: string): Promise<string> {
  return dataUri(file, await readFile(file));
}

/** An image embedded once into a page, which is used by its id. */
export interface EmbeddedImage {
  id: string;
  dataUri: string;
  width: number;
  height: number;
}

/** Reads the image at `file` to be embedded with `id`. */
export async function embedImage(
  file: string,
  id: string,
): Promise<EmbeddedImage> {
  const data = await readFile(file);
  const { width, height } = imageSize(data);
  return { id, dataUri: dataUri(file, data), width, height };
}

/**
 * Returns the hidden `svg` element that holds the embedded `images`, which
 * documents and slides use by their ids.
 */
export function imageDefinitions(
  containerId: string,
  images: readonly EmbeddedImage[],
): string {
  return `<svg id="${containerId}" aria-hidden="true" style="display: none"><defs>${images
    .map(
      ({ id, dataUri, width, height }) =>
        `<image id="${id}" href="${dataUri}" width="${String(width)}" height="${String(height)}"/>`,
    )
    .join('')}</defs></svg>`;
}

/**
 * Returns an `svg` element that shows the embedded `image` in place of an
 * `img` element with `attributes`: with its alt text as its label, its title,
 * or else its alt text, as its `title`, which text extractors can read, and
 * its id, so that links still point at it.
 */
export function imageReference(
  image: EmbeddedImage,
  attributes: ImageAttributes,
): string {
  const alt = attributes.get('alt') ?? '';
  const id = attributes.get('id');
  const ownWidth = Number(attributes.get('width') ?? Number.NaN);
  const ownHeight = Number(attributes.get('height') ?? Number.NaN);
  const ratio = image.height === 0 ? 1 : image.width / image.height;
  const width = Number.isFinite(ownWidth)
    ? ownWidth
    : Number.isFinite(ownHeight)
      ? Math.round(ownHeight * ratio)
      : image.width;
  const height = Number.isFinite(ownHeight)
    ? ownHeight
    : Math.round(width / ratio);
  const label =
    alt === ''
      ? ' aria-hidden="true"'
      : ` role="img" aria-label="${escapeAttribute(alt)}"`;
  // Like the `title` of an `img`, which is shown as a tooltip.
  const title = alt === '' ? '' : (attributes.get('title') ?? alt);
  return `<svg${id === undefined ? '' : ` id="${escapeAttribute(id)}"`}${label} width="${String(width)}" height="${String(height)}" viewBox="0 0 ${String(image.width)} ${String(image.height)}">${
    title === '' ? '' : `<title>${escapeAttribute(title)}</title>`
  }<use href="#${image.id}"/></svg>`;
}
