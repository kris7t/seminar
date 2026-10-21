import { afterEach, describe, expect, it, vi } from 'vitest';

import { probeSlideBackground, slideBackground } from './slideBackground.ts';

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('slide backgrounds', () => {
  it('uses the frame background for a transparent master, ignoring colored content', () => {
    const frame = document.createElement('div');
    frame.style.backgroundColor = 'white';
    frame.innerHTML =
      '<style>h1 { background: red }</style><div style="display:contents"><section><h1>Title</h1></section></div>';
    document.body.append(frame);
    expect(slideBackground(frame)).toBe('rgb(255, 255, 255)');
  });

  it('resolves master classes from the inert probe without mounting its contents', () => {
    const styles = document.createElement('style');
    styles.textContent = 'section.colored {background-color:rgb(18,52,86)}';
    document.body.append(styles);
    const frame = document.implementation.createHTMLDocument('').body;
    frame.innerHTML =
      '<div lang="hu" style="display:contents"><section class="colored"><img src="/large.png"></section></div>';
    const reads = vi.spyOn(window, 'getComputedStyle');
    expect(probeSlideBackground(frame)).toBe('rgb(18, 52, 86)');
    const master = reads.mock.calls.find(([element]) =>
      element.classList.contains('colored'),
    )?.[0];
    expect(master?.ownerDocument).toBe(document);
    expect(master?.children).toHaveLength(0);
    expect(master?.isConnected).toBe(false);
    expect(document.querySelector('img')).toBeNull();
    expect(frame.querySelector('img')?.getAttribute('src')).toBe('/large.png');
  });

  it('strips resource attributes before sampling an image master in the active document', () => {
    const frame = document.implementation.createHTMLDocument('').body;
    frame.innerHTML =
      '<img class="cover" src="/large.png" srcset="/huge.png 2x" style="background-color:navy">';
    const reads = vi.spyOn(window, 'getComputedStyle');
    expect(probeSlideBackground(frame)).toBe('rgb(0, 0, 128)');
    const copy = reads.mock.calls[0]?.[0];
    expect(copy?.getAttribute('src')).toBeNull();
    expect(copy?.getAttribute('srcset')).toBeNull();
    expect(copy?.getAttribute('class')).toBe('cover');
    expect(copy?.isConnected).toBe(false);
    expect(frame.querySelector('img')?.getAttribute('src')).toBe('/large.png');
  });
});
