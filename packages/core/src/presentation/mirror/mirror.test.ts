import { describe, expect, it } from 'vitest';

import { isTextField, pathOf, resolvePath } from './interactionState.ts';
import { rewriteSelector } from './mirrorStylisPlugin.ts';

describe('rewriteSelector', () => {
  it('also matches the marked elements', () => {
    expect(rewriteSelector('.a:hover .b')).toBe(
      '.a:is(:hover,[data-mirror-hover]) .b',
    );
    expect(rewriteSelector('.a:focus')).toBe(
      '.a:is(:focus,[data-mirror-focus])',
    );
    expect(rewriteSelector('.a:focus-visible')).toBe(
      '.a:is(:focus-visible,[data-mirror-focus-visible])',
    );
    expect(rewriteSelector('.a:focus-within')).toBe(
      '.a:is(:focus-within,[data-mirror-focus-within])',
    );
  });

  it('leaves other selectors alone', () => {
    expect(rewriteSelector('.Mui-focused .a')).toBe('.Mui-focused .a');
    expect(rewriteSelector('.a:active')).toBe('.a:active');
  });
});

describe('element paths', () => {
  it('finds the same element in another copy', () => {
    const html = '<div><span></span><p><b></b><i></i></p></div>';
    const a = document.createElement('div');
    a.innerHTML = html;
    const b = document.createElement('div');
    b.innerHTML = html;
    const element = a.querySelector('i');
    expect(element).not.toBeNull();
    const path = element === null ? undefined : pathOf(a, element);
    expect(path).toEqual([0, 1, 1]);
    expect(path === undefined ? undefined : resolvePath(b, path)).toBe(
      b.querySelector('i'),
    );
    expect(resolvePath(b, [0, 5])).toBeUndefined();
    expect(pathOf(a, b)).toBeUndefined();
  });
});

describe('isTextField', () => {
  it('only accepts fields with a selection', () => {
    const text = document.createElement('input');
    const number = document.createElement('input');
    number.type = 'number';
    expect(isTextField(text)).toBe(true);
    expect(isTextField(number)).toBe(false);
    expect(isTextField(document.createElement('textarea'))).toBe(true);
    expect(isTextField(document.createElement('div'))).toBe(false);
    expect(isTextField(undefined)).toBe(false);
  });
});
