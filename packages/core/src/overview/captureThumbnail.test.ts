import { getFontEmbedCSS, toPng } from 'html-to-image';
import { waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  captureThumbnail,
  THUMBNAIL_HEIGHT,
  THUMBNAIL_WIDTH,
} from './captureThumbnail.ts';

vi.unmock('./captureThumbnail.ts');
vi.mock('html-to-image', () => ({
  getFontEmbedCSS: vi.fn(),
  toPng: vi.fn(),
}));

const nativeGetComputedStyle = window.getComputedStyle.bind(window);

function frozenStyle(
  frame: HTMLElement | undefined,
  element: HTMLElement | SVGElement | undefined = frame,
): CSSStyleDeclaration {
  const style = document.createElement('div').style;
  const name = element?.getAttribute('data-seminar-thumbnail-style');
  const rules = frame?.querySelector('style')?.textContent ?? '';
  style.cssText =
    rules
      .split(`[data-seminar-thumbnail-style="${name ?? ''}"]{`)[1]
      ?.split('}')[0] ?? '';
  if (element) {
    for (const property of element.style)
      style.setProperty(property, element.style.getPropertyValue(property));
  }
  return style;
}

beforeEach(() => {
  vi.mocked(toPng).mockReset();
  vi.mocked(getFontEmbedCSS).mockReset().mockResolvedValue('');
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
    // jsdom does not implement computed styles of pseudo-elements.
    if (pseudo) {
      const style = document.createElement('div').style;
      style.content = 'none';
      return style;
    }
    return nativeGetComputedStyle(element);
  });
});

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('captureThumbnail', () => {
  it('omits hidden branches and original stylesheets without visiting their contents', async () => {
    vi.mocked(toPng).mockResolvedValueOnce('image');
    const frame = document.createElement('div');
    frame.innerHTML =
      '<style>.unused { color: red; }</style><div style="display:none"><span>Hidden step</span></div><span>Shown step</span>';
    const hidden = frame.querySelector('div span');
    document.body.append(frame);
    const reads = vi.spyOn(window, 'getComputedStyle');
    await captureThumbnail(frame);
    const [clone] = vi.mocked(toPng).mock.calls.at(-1) ?? [];
    expect(clone?.textContent).not.toContain('Hidden step');
    expect(clone?.textContent).not.toContain('.unused');
    expect(clone?.textContent).toContain('Shown step');
    expect(reads.mock.calls.some(([element]) => element === hidden)).toBe(
      false,
    );
    expect(frame.textContent).toContain('Hidden step');
  });

  it('preserves children that override an ancestor’s hidden visibility', async () => {
    vi.mocked(toPng).mockResolvedValueOnce('image');
    const frame = document.createElement('div');
    frame.innerHTML =
      '<div style="visibility:hidden"><span style="visibility:visible">Shown child</span></div>';
    document.body.append(frame);
    await captureThumbnail(frame);
    const [clone] = vi.mocked(toPng).mock.calls.at(-1) ?? [];
    const child = clone?.querySelector('span');
    expect(child?.textContent).toBe('Shown child');
    expect(frozenStyle(clone, child ?? undefined).visibility).toBe('visible');
  });

  it('keeps hidden SVG definitions that visible glyphs can reference', async () => {
    vi.mocked(toPng).mockResolvedValueOnce('image');
    const frame = document.createElement('div');
    frame.innerHTML =
      '<svg><defs style="display:none"><path id="glyph" d="M0 0 L10 10" /></defs><use href="#glyph" /></svg>';
    document.body.append(frame);
    await captureThumbnail(frame);
    const [clone] = vi.mocked(toPng).mock.calls.at(-1) ?? [];
    expect(clone?.querySelector('#glyph')?.getAttribute('d')).toBe(
      'M0 0 L10 10',
    );
    expect(clone?.querySelector('use')?.getAttribute('href')).toBe('#glyph');
  });

  it('lets the targets of use elements inherit from where they are used', async () => {
    vi.mocked(toPng).mockResolvedValueOnce('image');
    const frame = document.createElement('div');
    frame.innerHTML =
      '<svg><defs><g id="glyphs"><path id="plain" /><path id="own" style="fill:rgb(1, 2, 3)" /></g><path id="unused" /></defs><g id="group" style="fill:rgb(4, 5, 6)"><use href="#glyphs" /><use xlink:href="#plain" /></g></svg>';
    document.body.append(frame);
    await captureThumbnail(frame);
    const [clone] = vi.mocked(toPng).mock.calls.at(-1) ?? [];
    const rule = (id: string): string => {
      const name = clone
        ?.querySelector(`#${id}`)
        ?.getAttribute('data-seminar-thumbnail-style');
      const rules = clone?.querySelector('style')?.textContent ?? '';
      return (
        rules
          .split(`[data-seminar-thumbnail-style="${name ?? ''}"]{`)[1]
          ?.split('}')[0] ?? ''
      );
    };
    expect(rule('plain')).not.toContain('all:initial');
    expect(rule('plain')).not.toContain('fill:');
    // Styles of the target itself still apply, and other elements stay frozen.
    expect(rule('own')).not.toContain('all:initial');
    expect(rule('own')).toContain('fill:rgb(1, 2, 3)');
    expect(rule('unused')).toContain('all:initial');
    expect(rule('group')).toContain('fill:rgb(4, 5, 6)');
  });

  it('yields while cloning a large visible subtree', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      let time = 0;
      vi.spyOn(performance, 'now').mockImplementation(() => (time += 3));
      vi.mocked(toPng).mockResolvedValueOnce('image');
      const frame = document.createElement('div');
      frame.innerHTML = '<span>Cell</span>'.repeat(30);
      document.body.append(frame);
      const clones = vi.spyOn(Node.prototype, 'cloneNode');
      const pending = captureThumbnail(frame);
      let clonedDuringBrowserTask = 0;
      setTimeout(() => {
        clonedDuringBrowserTask = clones.mock.calls.length;
      }, 0);
      await vi.runAllTimersAsync();
      await pending;
      expect(clonedDuringBrowserTask).toBeGreaterThan(0);
      expect(clonedDuringBrowserTask).toBeLessThan(clones.mock.calls.length);
    } finally {
      vi.useRealTimers();
    }
  });

  it('yields before capture and between batches so browser tasks can run', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      let time = 0;
      vi.spyOn(performance, 'now').mockImplementation(() => (time += 3));
      vi.mocked(toPng).mockResolvedValueOnce('image');
      const frame = document.createElement('div');
      frame.innerHTML = '<span>Cell</span>'.repeat(30);
      document.body.append(frame);
      const reads = vi.spyOn(window, 'getComputedStyle');
      const pending = captureThumbnail(frame);
      expect(reads).not.toHaveBeenCalled();
      let readsDuringBrowserTask = 0;
      setTimeout(() => {
        readsDuringBrowserTask = reads.mock.calls.length;
      }, 0);
      await vi.runAllTimersAsync();
      expect(await pending).toBe('image');
      expect(readsDuringBrowserTask).toBeGreaterThan(0);
      expect(readsDuringBrowserTask).toBeLessThan(reads.mock.calls.length);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels between batches without rasterizing or leaking a snapshot', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      let time = 0;
      vi.spyOn(performance, 'now').mockImplementation(() => (time += 3));
      const frame = document.createElement('div');
      frame.innerHTML = '<span>Cell</span>'.repeat(30);
      document.body.append(frame);
      const controller = new AbortController();
      const result = expect(
        captureThumbnail(frame, controller.signal),
      ).rejects.toThrow();
      setTimeout(() => {
        controller.abort();
      }, 0);
      await vi.runAllTimersAsync();
      await result;
      expect(toPng).not.toHaveBeenCalled();
      expect(document.body.children).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('captures a retained source without attaching the frozen clone', async () => {
    const rasterized = Promise.withResolvers<string>();
    vi.mocked(toPng).mockReturnValueOnce(rasterized.promise);
    const frame = document.createElement('div');
    frame.style.cssText = 'transform: scale(0.5); background-color: red;';
    const content = document.createElement('span');
    content.textContent = 'Before';
    content.style.color = 'blue';
    content.style.viewTransitionName = 'content';
    frame.append(content);
    document.body.append(frame);
    const pending = captureThumbnail(frame);
    await waitFor(() => {
      expect(toPng).toHaveBeenCalledOnce();
    });
    content.textContent = 'After';
    content.style.color = 'green';
    frame.remove();
    const [clone, options] = vi.mocked(toPng).mock.calls.at(-1) ?? [];
    expect(clone?.querySelector('span')?.textContent).toBe('Before');
    expect(frozenStyle(clone).backgroundColor).toBe('rgb(255, 0, 0)');
    expect(
      frozenStyle(clone, clone?.querySelector('span') ?? undefined).color,
    ).toBe('rgb(0, 0, 255)');
    expect(clone?.querySelector('style')?.textContent).toContain(
      'view-transition-name:none!important',
    );
    expect(clone?.style.transform).toBe('none');
    expect(options).toMatchObject({
      canvasWidth: THUMBNAIL_WIDTH,
      canvasHeight: THUMBNAIL_HEIGHT,
      includeStyleProperties: [],
    });
    expect(clone?.isConnected).toBe(false);
    rasterized.resolve('data:image/png,thumbnail');
    expect(await pending).toBe('data:image/png,thumbnail');
    expect(clone?.isConnected).toBe(false);
  });

  it('copies canvas pixels and the current values of form controls', async () => {
    vi.mocked(toPng).mockResolvedValueOnce('image');
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
      'data:image/png,pixels',
    );
    const frame = document.createElement('div');
    frame.innerHTML =
      '<canvas></canvas><input type="checkbox"><textarea></textarea><select><option>A</option><option>B</option></select>';
    const input = frame.querySelector('input');
    const textarea = frame.querySelector('textarea');
    const select = frame.querySelector('select');
    if (input === null || textarea === null || select === null) {
      throw new Error('Missing controls');
    }
    input.checked = true;
    textarea.value = 'Edited';
    select.selectedIndex = 1;
    document.body.append(frame);
    await captureThumbnail(frame);
    const [clone] = vi.mocked(toPng).mock.calls.at(-1) ?? [];
    expect(drawImage).toHaveBeenCalledWith(frame.querySelector('canvas'), 0, 0);
    expect(clone?.querySelector('img')?.src).toBe('data:image/png,pixels');
    expect(clone?.querySelector('input')?.checked).toBe(true);
    expect(clone?.querySelector('textarea')?.value).toBe('Edited');
    expect(clone?.querySelector('select')?.value).toBe('B');
  });

  it('resets omitted defaults so children do not inherit a parent’s different style', async () => {
    const mock = vi.spyOn(window, 'getComputedStyle');
    const original = mock.getMockImplementation();
    mock.mockImplementation((element, pseudo) => {
      if (element instanceof HTMLElement && element.style.all === 'initial') {
        const style = document.createElement('div').style;
        style.color = 'rgb(0, 0, 0)';
        style.fontSize = '16px';
        return style;
      }
      return original?.(element, pseudo) ?? document.createElement('div').style;
    });
    vi.mocked(toPng).mockResolvedValueOnce('image');
    const frame = document.createElement('div');
    frame.style.color = 'red';
    frame.innerHTML =
      '<span style="color:black; font-size:16px; --token:large-value">Child</span>';
    document.body.append(frame);
    await captureThumbnail(frame);
    const [clone] = vi.mocked(toPng).mock.calls.at(-1) ?? [];
    expect(frozenStyle(clone).color).toBe('rgb(255, 0, 0)');
    const child = clone?.querySelector('span');
    expect(frozenStyle(clone, child ?? undefined).all).toBe('initial');
    expect(child?.style.color).toBe('');
    expect(child?.style.fontSize).toBe('');
    expect(child?.style.getPropertyValue('--token')).toBe('');
    expect(frame.querySelector('span')?.style.getPropertyValue('--token')).toBe(
      'large-value',
    );
  });

  it('shares repeated styles while keeping image backgrounds available for embedding', async () => {
    vi.mocked(toPng).mockResolvedValueOnce('image');
    const frame = document.createElement('div');
    frame.innerHTML =
      '<span style="color:red">A</span><span style="color:red">B</span><div style="background-image:url(https://example.test/image.png)"></div>';
    document.body.append(frame);
    await captureThumbnail(frame);
    const [clone] = vi.mocked(toPng).mock.calls.at(-1) ?? [];
    const spans = clone?.querySelectorAll('span');
    const name = spans?.[0]?.getAttribute('data-seminar-thumbnail-style');
    expect(name).toBeTruthy();
    expect(spans?.[1]?.getAttribute('data-seminar-thumbnail-style')).toBe(name);
    expect(spans?.[0]?.style.color).toBe('');
    expect(frozenStyle(clone, spans?.[0]).color).toBe('rgb(255, 0, 0)');
    expect(clone?.querySelector('div')?.style.backgroundImage).toContain(
      'https://example.test/image.png',
    );
  });

  it('fetches resources without the signal, which html-to-image caches', async () => {
    vi.mocked(toPng).mockResolvedValueOnce('image');
    const frame = document.createElement('div');
    frame.innerHTML = '<span style="font-family:A">Text</span>';
    document.body.append(frame);
    await captureThumbnail(frame, new AbortController().signal);
    expect(vi.mocked(getFontEmbedCSS).mock.calls[0]?.[1]).not.toHaveProperty(
      'fetchRequestInit',
    );
    expect(vi.mocked(toPng).mock.calls[0]?.[1]).not.toHaveProperty(
      'fetchRequestInit',
    );
  });

  it('embeds the collected font families without repeated inline declarations', async () => {
    const mock = vi.spyOn(window, 'getComputedStyle');
    const original = mock.getMockImplementation();
    mock.mockImplementation((element, pseudo) => {
      if (pseudo === '::before' && element.textContent === 'First') {
        const style = document.createElement('span').style;
        style.content = '"Icon"';
        style.fontFamily = 'Icons';
        return style;
      }
      return original?.(element, pseudo) ?? document.createElement('div').style;
    });
    vi.mocked(getFontEmbedCSS).mockResolvedValueOnce(
      '@font-face{font-family:A}',
    );
    vi.mocked(toPng).mockResolvedValueOnce('image');
    const frame = document.createElement('div');
    frame.innerHTML =
      '<span style="font-family:A">First</span><span style="font-family:B">Second</span><span style="font-family:A">Third</span>';
    document.body.append(frame);
    await captureThumbnail(frame);
    const [sample] = vi.mocked(getFontEmbedCSS).mock.calls[0] ?? [];
    expect(sample?.style.fontFamily).toContain('A');
    expect(sample?.style.fontFamily).toContain('B');
    expect(sample?.style.fontFamily).toContain('Icons');
    expect(sample?.children).toHaveLength(0);
    const [clone, options] = vi.mocked(toPng).mock.calls[0] ?? [];
    expect(options?.fontEmbedCSS).toBe('@font-face{font-family:A}');
    expect(clone?.querySelector('span')?.style.fontFamily).toBe('');
    expect(
      frozenStyle(clone, clone?.querySelector('span') ?? undefined).fontFamily,
    ).toBe('A');
    expect(clone?.querySelector('style')?.textContent).toContain(
      'animation:none!important;transition:none!important;',
    );
  });

  it('preserves SVG transform origins even when they match an empty reference element', async () => {
    const mock = vi.spyOn(window, 'getComputedStyle');
    const original = mock.getMockImplementation();
    mock.mockImplementation((element, pseudo) => {
      if (
        !pseudo &&
        ((element instanceof HTMLElement && element.style.all === 'initial') ||
          element.tagName === 'g')
      ) {
        const style = document.createElement('div').style;
        // An empty HTML reference resolves 50% 50% to the same pixels as
        // SVG's 0 0 origin, despite having a different CSS initial value.
        style.transformOrigin = '0px 0px';
        style.perspectiveOrigin = '0px 0px';
        if (element.tagName === 'g')
          style.transform = 'matrix(1, 0, 0, -1, 0, 0)';
        return style;
      }
      return original?.(element, pseudo) ?? document.createElement('div').style;
    });
    vi.mocked(toPng).mockResolvedValueOnce('image');
    const frame = document.createElement('div');
    frame.innerHTML =
      '<svg viewBox="0 -1000 2000 2000"><g transform="scale(1,-1)"><path d="M0 0 L100 100" /></g></svg>';
    document.body.append(frame);
    await captureThumbnail(frame);
    const [clone] = vi.mocked(toPng).mock.calls.at(-1) ?? [];
    const group = clone?.querySelector('g');
    const style = frozenStyle(clone, group ?? undefined);
    expect(style.transformOrigin).toBe('0px 0px');
    expect(style.perspectiveOrigin).toBe('0px 0px');
    expect(style.transform).toBe('matrix(1, 0, 0, -1, 0, 0)');
  });

  it('freezes pseudo-elements before disabling the rasterizer’s second style copy', async () => {
    const mock = vi.spyOn(window, 'getComputedStyle');
    const original = mock.getMockImplementation();
    mock.mockImplementation((element, pseudo) => {
      if (pseudo === '::before') {
        const style = document.createElement('div').style;
        style.content = '"Before"';
        style.color = 'red';
        style.position = 'absolute';
        style.left = '12px';
        return style;
      }
      return original?.(element, pseudo) ?? document.createElement('div').style;
    });
    vi.mocked(toPng).mockResolvedValueOnce('image');
    const frame = document.createElement('div');
    document.body.append(frame);
    await captureThumbnail(frame);
    const [clone] = vi.mocked(toPng).mock.calls.at(-1) ?? [];
    const rules = clone?.querySelector('style')?.textContent;
    expect(rules).toContain('::before');
    expect(rules).toMatch(/content:\s*"Before"/);
    expect(rules).toMatch(/left:\s*12px/);
    expect(rules).toMatch(/color:\s*red/);
    expect(frame.hasAttribute('data-seminar-thumbnail-pseudo')).toBe(false);
  });

  it('removes the offscreen snapshot even if rasterization fails', async () => {
    vi.mocked(toPng).mockRejectedValueOnce(new Error('Unreadable media'));
    const frame = document.createElement('div');
    document.body.append(frame);
    await expect(captureThumbnail(frame)).rejects.toThrow('Unreadable media');
    expect(document.body.children).toHaveLength(1);
    expect(frame.isConnected).toBe(true);
  });
});
