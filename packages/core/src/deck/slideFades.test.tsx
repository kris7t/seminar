import { describe, expect, it } from 'vitest';

import type { SlideMaster } from '../masters/SlideMaster.ts';
import { defaultSlideTheme } from '../theme/createSlideTheme.ts';
import { Slide, type SlideProps } from '../slide/Slide.tsx';
import { getFadeBetween, getStepFade } from './slideFades.ts';

const masters = defaultSlideTheme.master;

function slide(props: Omit<SlideProps, 'children'> = {}) {
  return <Slide {...props}>Content</Slide>;
}

const between = (
  from: Omit<SlideProps, 'children'>,
  to: Omit<SlideProps, 'children'>,
  forward = true,
) => getFadeBetween(slide(from), slide(to), forward, masters);

describe('getFadeBetween', () => {
  it('takes the theme without fades of the slides', () => {
    expect(between({}, {})).toBeUndefined();
  });

  it('takes the fade of either slide', () => {
    expect(between({ fade: 300 }, {})).toBe(300);
    expect(between({}, { fade: '300' })).toBe(300);
  });

  it('takes the longer of equally explicit fades', () => {
    expect(between({ fade: 300 }, { fade: 100 })).toBe(300);
  });

  it("doesn't cut with fades of no time", () => {
    expect(between({ fade: 300 }, { fade: 0 })).toBe(300);
    expect(between({}, { fadeIn: 0 })).toBe(0);
    // Less explicit than the side of the other slide.
    expect(between({ fadeAfter: 300 }, { fade: 0 })).toBe(300);
  });

  it('prefers the fades of the sides crossed', () => {
    expect(between({ fade: 100 }, { fadeIn: 300 })).toBe(300);
    expect(between({ fadeAfter: 300 }, { fade: 100 })).toBe(300);
    // Going back crosses the other sides.
    expect(between({ fadeAfter: 300 }, { fade: 100 }, false)).toBe(100);
  });

  it('prefers the fades of the slide to those of its master', () => {
    const Master: SlideMaster = ({ children }) => <div>{children}</div>;
    Master.fadeIn = 100;
    expect(between({ fade: 300 }, { master: Master })).toBe(300);
  });

  it('cuts whatever equally explicit fades say', () => {
    expect(between({}, { cut: true })).toBe(0);
    expect(between({ cut: 'after' }, {})).toBe(0);
    expect(between({ cut: 'after' }, {}, false)).toBeUndefined();
    expect(between({ fadeOut: 300 }, { cut: 'before' })).toBe(0);
    expect(between({ fadeAfter: 600 }, { cut: true })).toBe(0);
  });

  it('lets slides override the cuts of their master', () => {
    const Cut: SlideMaster = ({ children }) => <div>{children}</div>;
    Cut.cut = true;
    expect(between({}, { master: Cut })).toBe(0);
    expect(between({}, { master: Cut, cut: false })).toBeUndefined();
    expect(between({ fadeAfter: 300 }, { master: Cut })).toBe(300);
  });
});

describe('getStepFade', () => {
  it('takes the fade of the slide, but not its sides or cuts', () => {
    expect(getStepFade(slide({ fade: 300, cut: true }), masters)).toBe(300);
    expect(getStepFade(slide({ fadeIn: 300 }), masters)).toBeUndefined();
  });
});
