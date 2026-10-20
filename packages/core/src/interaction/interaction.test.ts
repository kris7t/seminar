import { afterEach, describe, expect, it } from 'vitest';

import { getInteraction, usesKey, type Interaction } from './interaction.ts';

function classify(html: string): Interaction | undefined {
  document.body.innerHTML = html;
  return getInteraction(document.querySelector('#target'));
}

describe('getInteraction', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it.each<[string, Interaction | undefined]>([
    ['<p id="target">text</p>', undefined],
    ['<a id="target">no href</a>', undefined],
    ['<input id="target">', 'text'],
    ['<input id="target" type="email">', 'text'],
    ['<textarea id="target"></textarea>', 'text'],
    ['<select id="target"></select>', 'text'],
    ['<div role="textbox" id="target"></div>', 'text'],
    ['<input id="target" type="range">', 'composite'],
    ['<input id="target" type="radio">', 'composite'],
    ['<div role="tablist"><span id="target">tab</span></div>', 'composite'],
    ['<span role="slider" id="target"></span>', 'composite'],
    ['<a href="#" id="target">link</a>', 'activatable'],
    ['<button><span id="target">nested</span></button>', 'activatable'],
    ['<input id="target" type="checkbox">', 'activatable'],
    ['<div role="switch" id="target"></div>', 'activatable'],
    ['<div tabindex="0" id="target"></div>', 'activatable'],
    ['<div tabindex="-1" id="target"></div>', undefined],
    ['<div data-seminar-interactive><p id="target">x</p></div>', 'custom'],
    ['<div role="dialog"><button id="target">OK</button></div>', 'custom'],
    ['<div aria-modal="true"><p id="target">x</p></div>', 'custom'],
  ])('classifies %s as %s', (html, expected) => {
    expect(classify(html)).toBe(expected);
  });

  it('uses the closest interactive element', () => {
    expect(
      classify('<div role="listbox"><button id="target">b</button></div>'),
    ).toBe('activatable');
  });
});

describe('usesKey', () => {
  it.each<[Interaction | undefined, string, boolean]>([
    [undefined, 'ArrowRight', false],
    ['text', 'ArrowRight', true],
    ['text', ' ', true],
    ['custom', 'PageDown', true],
    ['composite', 'ArrowRight', true],
    ['composite', 'Home', true],
    ['composite', ' ', true],
    ['composite', 'Enter', true],
    ['activatable', ' ', true],
    ['activatable', 'ArrowRight', false],
    ['activatable', 'PageDown', false],
  ])('%s uses %j: %s', (interaction, key, expected) => {
    expect(usesKey(interaction, key)).toBe(expected);
  });
});
