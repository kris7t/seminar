import { toPng } from 'html-to-image';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  captureThumbnail,
  THUMBNAIL_HEIGHT,
  THUMBNAIL_WIDTH,
} from './captureThumbnail.ts';

vi.unmock('./captureThumbnail.ts');
vi.mock('html-to-image', () => ({ toPng: vi.fn() }));

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('captureThumbnail', () => {
  it('freezes content and computed styles before the source changes or unmounts', async () => {
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
    content.textContent = 'After';
    content.style.color = 'green';
    frame.remove();
    const [clone, options] = vi.mocked(toPng).mock.calls.at(-1) ?? [];
    expect(clone?.textContent).toBe('Before');
    expect(clone?.style.backgroundColor).toBe('rgb(255, 0, 0)');
    expect(clone?.querySelector('span')?.style.color).toBe('rgb(0, 0, 255)');
    expect(clone?.querySelector('span')?.style.viewTransitionName).toBe('none');
    expect(clone?.style.transform).toBe('none');
    expect(options).toMatchObject({
      canvasWidth: THUMBNAIL_WIDTH,
      canvasHeight: THUMBNAIL_HEIGHT,
    });
    expect(clone?.isConnected).toBe(true);
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
    expect(clone?.querySelector('input')?.checked).toBe(true);
    expect(clone?.querySelector('textarea')?.value).toBe('Edited');
    expect(clone?.querySelector('select')?.value).toBe('B');
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
