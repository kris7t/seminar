import type { Area } from './wayland/windows.ts';

/**
 * Returns the area that the features of `window.open`, like
 * `popup,left=0,top=0,width=1920,height=1080`, ask for, if they give all of
 * its position and size.
 */
export function featureArea(features: string): Area | undefined {
  const values = new Map(
    features.split(',').map((feature) => {
      const [name = '', value = ''] = feature.split('=');
      return [name.trim().toLowerCase(), Number(value.trim())];
    }),
  );
  const left = values.get('left');
  const top = values.get('top');
  const width = values.get('width');
  const height = values.get('height');
  if (
    left === undefined ||
    top === undefined ||
    width === undefined ||
    height === undefined ||
    ![left, top, width, height].every(Number.isFinite)
  ) {
    return undefined;
  }
  return { left, top, width, height };
}
