import { describe, expect, it } from 'vitest';

import { featureArea } from './windowFeatures.ts';

describe('featureArea', () => {
  it('reads the area that the window asks for', () => {
    expect(
      featureArea('popup,fullscreen,left=1920,top=0,width=1280,height=720'),
    ).toEqual({ left: 1920, top: 0, width: 1280, height: 720 });
    expect(
      featureArea('popup, Left=-1280 ,top=10,width=1280,height=720'),
    ).toEqual({ left: -1280, top: 10, width: 1280, height: 720 });
  });

  it('needs the whole area', () => {
    expect(featureArea('popup,width=960,height=540')).toBeUndefined();
    expect(featureArea('left=0,top=0,width=wide,height=540')).toBeUndefined();
    expect(featureArea('')).toBeUndefined();
  });
});
