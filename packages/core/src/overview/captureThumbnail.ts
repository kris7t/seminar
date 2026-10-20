import { toPng } from 'html-to-image';

import { SLIDE_HEIGHT, SLIDE_WIDTH } from '../theme/createSlideTheme.ts';

/** Scale of cached thumbnails in logical pixels. */
export const THUMBNAIL_SCALE = 0.2;
export const THUMBNAIL_WIDTH: number = SLIDE_WIDTH * THUMBNAIL_SCALE;
export const THUMBNAIL_HEIGHT: number = SLIDE_HEIGHT * THUMBNAIL_SCALE;

let nextSnapshot = 0;

function initialStyles(): Map<string, string> {
  const reference = document.createElement('span');
  reference.style.setProperty('all', 'initial', 'important');
  document.body.append(reference);
  try {
    const style = getComputedStyle(reference);
    return new Map(
      Array.from(style, (property) => [
        property,
        style.getPropertyValue(property),
      ]),
    );
  } finally {
    reference.remove();
  }
}

function styleText(
  style: CSSStyleDeclaration,
  initial: Map<string, string>,
): string {
  const declarations = ['all:initial;'];
  for (const property of style) {
    // Computed properties already resolve variables. Resetting each element
    // lets us omit initial values without accidentally inheriting a parent’s
    // styles, and keeps dense snapshots much smaller to clone and serialize.
    if (property.startsWith('--')) continue;
    const value = style.getPropertyValue(property);
    if (
      value !== initial.get(property) ||
      property === 'direction' ||
      property === 'unicode-bidi' ||
      // Origins resolve percentages against the element's box. The empty
      // reference's 0px 0px doesn't mean the CSS initial value is zero.
      property === 'transform-origin' ||
      property === 'perspective-origin'
    ) {
      declarations.push(`${property}:${value};`);
    }
  }
  return declarations.join('');
}

async function yieldToBrowser(signal: AbortSignal | undefined): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
  signal?.throwIfAborted();
}

/** Copies styles in short tasks while the source slide remains mounted. */
async function freezeSlide(
  frame: HTMLElement,
  signal: AbortSignal | undefined,
): Promise<HTMLElement> {
  await yieldToBrowser(signal);
  const initial = initialStyles();
  const clone = frame.cloneNode(true) as HTMLElement;
  const sources = [frame, ...frame.querySelectorAll('*')];
  const copies = [clone, ...clone.querySelectorAll('*')];
  const snapshot = ++nextSnapshot;
  const pseudos: string[] = [];
  const styles = new Map<string, string>();
  let started = performance.now();
  for (const [index, source] of sources.entries()) {
    if (performance.now() - started >= 6) {
      await yieldToBrowser(signal);
      started = performance.now();
    }
    if (!frame.isConnected)
      throw new DOMException('The slide was unmounted', 'AbortError');
    const copy = copies[index];
    if (!(copy instanceof HTMLElement || copy instanceof SVGElement)) {
      continue;
    }
    const style = getComputedStyle(source);
    const declarations = styleText(style, initial);
    if (declarations.includes('url(')) {
      // The rasterizer embeds images referenced by inline backgrounds and masks.
      copy.style.cssText = declarations;
    } else {
      let name = styles.get(declarations);
      if (name === undefined) {
        name = `${String(snapshot)}-${String(styles.size)}`;
        styles.set(declarations, name);
      }
      copy.setAttribute('data-seminar-thumbnail-style', name);
      copy.style.cssText = '';
      // Font discovery reads inline declarations on the detached snapshot.
      copy.style.fontFamily = style.fontFamily;
    }
    for (const pseudo of ['::before', '::after']) {
      const pseudoStyle = window.getComputedStyle(source, pseudo);
      const content = pseudoStyle.getPropertyValue('content');
      if (content !== '' && content !== 'none' && content !== 'normal') {
        const name = `${String(snapshot)}-${String(index)}`;
        copy.setAttribute('data-seminar-thumbnail-pseudo', name);
        pseudos.push(
          `[data-seminar-thumbnail-pseudo="${name}"]${pseudo}{${styleText(pseudoStyle, initial)}animation:none;transition:none;view-transition-name:none;}`,
        );
      }
    }
    copy.style.animation = 'none';
    copy.style.transition = 'none';
    copy.style.viewTransitionName = 'none';
    if (
      source instanceof HTMLCanvasElement &&
      copy instanceof HTMLCanvasElement
    ) {
      copy.getContext('2d')?.drawImage(source, 0, 0);
      const image = document.createElement('img');
      for (const attribute of copy.attributes)
        image.setAttribute(attribute.name, attribute.value);
      image.src = copy.toDataURL();
      copy.replaceWith(image);
    } else if (source instanceof HTMLVideoElement && source.readyState >= 2) {
      const canvas = document.createElement('canvas');
      canvas.width = source.videoWidth;
      canvas.height = source.videoHeight;
      canvas.getContext('2d')?.drawImage(source, 0, 0);
      const image = document.createElement('img');
      for (const attribute of copy.attributes)
        image.setAttribute(attribute.name, attribute.value);
      image.src = canvas.toDataURL();
      copy.replaceWith(image);
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
  // Every element has frozen computed styles; original sheets would override
  // the shared declarations, and can make detached snapshots much larger.
  for (const stylesheet of clone.querySelectorAll('style')) stylesheet.remove();
  if (styles.size > 0 || pseudos.length > 0) {
    const stylesheet = document.createElement('style');
    stylesheet.textContent = [
      ...Array.from(
        styles,
        ([declarations, name]) =>
          `[data-seminar-thumbnail-style="${name}"]{${declarations}}`,
      ),
      ...pseudos,
    ].join('\n');
    clone.append(stylesheet);
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
 * Captures a slide in short batches. The source stays mounted until this
 * promise settles; aborting cancels captures of slides that are discarded.
 */
export async function captureThumbnail(
  frame: HTMLElement,
  signal?: AbortSignal,
): Promise<string> {
  const clone = await freezeSlide(frame, signal);
  signal?.throwIfAborted();
  // Frozen styles let the rasterizer work on a detached clone. Attaching
  // thousands of fully styled nodes would force another expensive layout.
  return toPng(clone, {
    width: SLIDE_WIDTH,
    height: SLIDE_HEIGHT,
    canvasWidth: THUMBNAIL_WIDTH,
    canvasHeight: THUMBNAIL_HEIGHT,
    pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    includeQueryParams: true,
    preferredFontFormat: 'woff2',
    // The frozen clone already has every computed style, including its
    // pseudo-elements. Recomputing and assigning them again dominates the
    // cost of capturing large slides.
    includeStyleProperties: [],
    fetchRequestInit: signal === undefined ? {} : { signal },
  });
}
