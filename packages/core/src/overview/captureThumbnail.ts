import { toPng } from 'html-to-image';

import { SLIDE_HEIGHT, SLIDE_WIDTH } from '../theme/createSlideTheme.ts';

/** Scale of cached thumbnails in logical pixels. */
export const THUMBNAIL_SCALE = 0.2;
export const THUMBNAIL_WIDTH: number = SLIDE_WIDTH * THUMBNAIL_SCALE;
export const THUMBNAIL_HEIGHT: number = SLIDE_HEIGHT * THUMBNAIL_SCALE;

/** Copies computed styles before React can change or unmount the slide. */
function freezeSlide(frame: HTMLElement): HTMLElement {
  const clone = frame.cloneNode(true) as HTMLElement;
  const sources = [frame, ...frame.querySelectorAll('*')];
  const copies = [clone, ...clone.querySelectorAll('*')];
  for (const [index, source] of sources.entries()) {
    const copy = copies[index];
    if (!(copy instanceof HTMLElement || copy instanceof SVGElement)) {
      continue;
    }
    const style = getComputedStyle(source);
    for (const property of style) {
      copy.style.setProperty(property, style.getPropertyValue(property));
    }
    copy.style.animation = 'none';
    copy.style.transition = 'none';
    copy.style.viewTransitionName = 'none';
    if (
      source instanceof HTMLCanvasElement &&
      copy instanceof HTMLCanvasElement
    ) {
      copy.getContext('2d')?.drawImage(source, 0, 0);
    } else if (source instanceof HTMLVideoElement && source.readyState >= 2) {
      const canvas = document.createElement('canvas');
      canvas.width = source.videoWidth;
      canvas.height = source.videoHeight;
      canvas.style.cssText = copy.style.cssText;
      canvas.getContext('2d')?.drawImage(source, 0, 0);
      copy.replaceWith(canvas);
    } else if (
      source instanceof HTMLInputElement &&
      copy instanceof HTMLInputElement
    ) {
      copy.value = source.value;
      copy.checked = source.checked;
    } else if (
      source instanceof HTMLTextAreaElement &&
      copy instanceof HTMLTextAreaElement
    ) {
      copy.value = source.value;
    } else if (
      source instanceof HTMLSelectElement &&
      copy instanceof HTMLSelectElement
    ) {
      for (const [optionIndex, option] of [...source.options].entries()) {
        const target = copy.options[optionIndex];
        if (target !== undefined) {
          target.selected = option.selected;
        }
      }
    }
  }
  Object.assign(clone.style, {
    position: 'relative',
    inset: 'auto',
    width: `${String(SLIDE_WIDTH)}px`,
    height: `${String(SLIDE_HEIGHT)}px`,
    transform: 'none',
    translate: 'none',
    zoom: '1',
  });
  return clone;
}

/**
 * Freezes the slide synchronously, then rasterizes it asynchronously. The
 * source may change or unmount as soon as this function returns.
 */
export async function captureThumbnail(frame: HTMLElement): Promise<string> {
  const clone = freezeSlide(frame);
  const host = document.createElement('div');
  host.inert = true;
  host.setAttribute('aria-hidden', 'true');
  Object.assign(host.style, {
    position: 'fixed',
    left: '-100000px',
    top: '0',
    pointerEvents: 'none',
  });
  host.append(clone);
  document.body.append(host);
  try {
    return await toPng(clone, {
      width: SLIDE_WIDTH,
      height: SLIDE_HEIGHT,
      canvasWidth: THUMBNAIL_WIDTH,
      canvasHeight: THUMBNAIL_HEIGHT,
      pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      includeQueryParams: true,
      preferredFontFormat: 'woff2',
    });
  } finally {
    host.remove();
  }
}
