import { createTheme } from '@mui/material/styles';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  clampElevation,
  parseBoxShadow,
  ShadowFilter,
  shadowExtent,
  shadowFilterUrl,
} from './shadow.tsx';

describe('parseBoxShadow', () => {
  it('parses the layers of MUI shadows', () => {
    expect(
      parseBoxShadow(
        '0px 2px 1px -1px rgba(0,0,0,0.2),0px 1px 1px 0px rgba(0,0,0,0.14)',
      ),
    ).toEqual([
      { offsetX: 0, offsetY: 2, blur: 1, spread: -1, color: 'rgba(0,0,0,0.2)' },
      { offsetX: 0, offsetY: 1, blur: 1, spread: 0, color: 'rgba(0,0,0,0.14)' },
    ]);
  });

  it('defaults the blur, spread, and color', () => {
    expect(parseBoxShadow('1px 0 rgb(0 0 0 / 0.5), 0 2px')).toEqual([
      { offsetX: 1, offsetY: 0, blur: 0, spread: 0, color: 'rgb(0 0 0 / 0.5)' },
      { offsetX: 0, offsetY: 2, blur: 0, spread: 0, color: 'currentColor' },
    ]);
  });

  it('leaves out inset layers and unsupported units', () => {
    expect(parseBoxShadow('none')).toEqual([]);
    expect(parseBoxShadow('inset 0 1px 2px black, 0 1em red')).toEqual([]);
  });

  it('rejects long lengths without a unit in linear time', () => {
    const start = performance.now();
    expect(parseBoxShadow(`0 ${'9'.repeat(50_000)}x`)).toEqual([]);
    expect(performance.now() - start).toBeLessThan(200);
  });

  it('measures how far the layers reach', () => {
    expect(shadowExtent(parseBoxShadow('0 3px 5px -1px black'))).toBe(7);
    expect(shadowExtent([])).toBe(0);
  });
});

describe('ShadowFilter', () => {
  const bounds = { x: 0, y: 0, width: 100, height: 50 };

  it('casts each layer, with the earlier ones on top', () => {
    const { container } = render(
      <svg>
        <ShadowFilter
          id="shadow"
          shadow="0 2px 4px 1px red, 0 1px 2px blue"
          bounds={bounds}
        />
      </svg>,
    );
    const filter = container.querySelector('filter#shadow');
    // Extended by the reach of the first layer.
    expect(
      ['x', 'y', 'width', 'height'].map((name) => filter?.getAttribute(name)),
    ).toEqual(['-7', '-7', '114', '64']);
    expect(
      [...container.querySelectorAll('feFlood')].map((flood) =>
        flood.getAttribute('flood-color'),
      ),
    ).toEqual(['red', 'blue']);
    expect(container.querySelectorAll('feMorphology')).toHaveLength(1);
    expect(
      [...container.querySelectorAll('feMergeNode')].map((node) =>
        node.getAttribute('in'),
      ),
    ).toEqual(['layer1', 'layer0', 'SourceGraphic']);
    expect(shadowFilterUrl('shadow', 'none')).toBeUndefined();
    expect(shadowFilterUrl('shadow', '0 1px black')).toBe('url(#shadow)');
  });

  it('renders nothing without a shadow', () => {
    const { container } = render(
      <svg>
        <ShadowFilter id="shadow" shadow="none" bounds={bounds} />
      </svg>,
    );
    expect(container.querySelector('filter')).toBeNull();
  });

  it('clamps elevations to the shadows of the theme', () => {
    const theme = createTheme();
    expect(clampElevation(theme, 3.6)).toBe(4);
    expect(clampElevation(theme, -2)).toBe(0);
    expect(clampElevation(theme, 99)).toBe(24);
    expect(clampElevation(theme, Number.NaN)).toBe(0);
  });
});
