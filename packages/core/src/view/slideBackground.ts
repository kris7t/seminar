/** The first content element, excluding sheets emitted alongside a master. */
function contentChild(element: Element): Element | undefined {
  return [...element.children].find(
    (child) => !['style', 'script', 'link'].includes(child.localName),
  );
}

function visibleColor(style: CSSStyleDeclaration): string | undefined {
  const color = style.backgroundColor;
  return color === '' || color === 'transparent' || color === 'rgba(0, 0, 0, 0)'
    ? undefined
    : color;
}

/** Reads the frame and master background, through wrappers without a box. */
export function slideBackground(frame: HTMLElement): string | undefined {
  const fallback = visibleColor(getComputedStyle(frame));
  let element = contentChild(frame);
  while (element !== undefined) {
    const style = getComputedStyle(element);
    if (style.display !== 'contents') return visibleColor(style) ?? fallback;
    element = contentChild(element);
  }
  return fallback;
}

/** Resolves a probed master's styles without mounting its content or resources. */
export function probeSlideBackground(frame: HTMLElement): string | undefined {
  // The probe's document has no window, so it cannot resolve computed styles.
  const reference = document.createElement('div');
  reference.hidden = true;
  document.body.append(reference);
  try {
    let source = contentChild(frame);
    let parent: Element = reference;
    while (source !== undefined) {
      const copy = source.cloneNode(false) as Element;
      // Keep styling attributes, but no URLs that could load resources when
      // the shallow clone moves out of the probe's inert document.
      for (const attribute of [...copy.attributes]) {
        if (
          !['class', 'style', 'id', 'lang', 'dir'].includes(attribute.name) &&
          !attribute.name.startsWith('data-')
        )
          copy.removeAttribute(attribute.name);
      }
      parent.append(copy);
      const style = getComputedStyle(copy);
      if (style.display !== 'contents') return visibleColor(style);
      parent = copy;
      source = contentChild(source);
    }
    return undefined;
  } finally {
    reference.remove();
  }
}
