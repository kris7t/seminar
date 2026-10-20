import { toPng } from 'html-to-image';
import { waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  captureThumbnail,
  THUMBNAIL_HEIGHT,
  THUMBNAIL_WIDTH,
} from './captureThumbnail.ts';

vi.unmock('./captureThumbnail.ts');
vi.mock('html-to-image', () => ({ toPng: vi.fn() }));

const nativeGetComputedStyle = window.getComputedStyle.bind(window);

function frozenStyle(
  frame: HTMLElement | undefined,
  element = frame,
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
    expect(clone?.querySelector('span')?.style.viewTransitionName).toBe('none');
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
