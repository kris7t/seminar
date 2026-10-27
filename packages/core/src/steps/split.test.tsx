import { cleanup, render, screen, within } from '@testing-library/react';
import type { Theme } from '@mui/material/styles';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Deck } from '../deck/Deck.tsx';
import { Slide, type SlideProps } from '../slide/Slide.tsx';
import { createSlideTheme } from '../theme/createSlideTheme.ts';
import { Step } from './Step.tsx';
import { Steps } from './Steps.tsx';

const MARKS: Record<string, string> = {
  'Exported as a page': 'page',
  'Covers other content': 'overlay',
};

/**
 * Renders a slide with `children`, and returns the entries of its step tree,
 * listing their icons in brackets, e.g., `[page]`.
 */
function splitOf(
  children: ReactNode,
  props: SlideProps = {},
  theme?: Theme,
): string[] {
  render(
    <Deck defaultShowSteps {...(theme === undefined ? {} : { theme })}>
      <Slide title="Split" {...props}>
        {children}
      </Slide>
    </Deck>,
  );
  const nav = screen.getByRole('navigation', { name: 'Steps' });
  return within(nav)
    .getAllByRole('button')
    .map((button) => {
      const label =
        button.querySelector('.MuiListItemText-root')?.textContent ?? '';
      const marks = [...button.querySelectorAll('svg title')].map(
        (title) => ` [${MARKS[title.textContent] ?? title.textContent}]`,
      );
      return label + marks.join('');
    });
}

describe('splitting slides into pages', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '#');
  });

  afterEach(() => {
    cleanup();
  });

  it('makes a single page of steps that stay shown', () => {
    expect(
      splitOf(
        <>
          <Step>A</Step>
          <Step dim>B</Step>
          <Step>C</Step>
        </>,
      ),
    ).toEqual(['Start of the slide', 'A', 'B', 'C [page]']);
  });

  it('makes a page before steps are hidden or collapsed', () => {
    expect(
      splitOf(
        <>
          <Step only>A</Step>
          <Step swap with="initial">
            B
          </Step>
          <Step swap>C</Step>
          <Step>D</Step>
        </>,
      ),
    ).toEqual([
      'Start of the slide [page]',
      'A [page]',
      'C [page]',
      'D [page]',
    ]);
  });

  it('makes a page of nested steps before their step is past', () => {
    expect(
      splitOf(
        <>
          <Step>
            A<Step expand>A.1</Step>
            <Step expand>A.2</Step>
          </Step>
          <Step>B</Step>
        </>,
      ),
    ).toEqual(['Start of the slide', 'A', 'A.1', 'A.2 [page]', 'B [page]']);
  });

  it('counts dimmed content as shown, unless the theme says otherwise', () => {
    const steps = (
      <>
        <Step focus>A</Step>
        <Step>B</Step>
      </>
    );
    expect(splitOf(steps)).toEqual(['Start of the slide', 'A', 'B [page]']);
    cleanup();
    expect(
      splitOf(steps, {}, createSlideTheme({ legibleStepAppearance: 'shown' })),
    ).toEqual(['Start of the slide', 'A [page]', 'B [page]']);
  });

  it('leaves out steps that need no page', () => {
    expect(
      splitOf(
        <>
          <Step>A</Step>
          <Step only split="none">
            Joke
          </Step>
          <Step>B</Step>
        </>,
      ),
    ).toEqual(['Start of the slide', 'A', 'Joke', 'B [page]']);
  });

  it('makes pages before, at, and at the end of steps', () => {
    const nested = (split: string) => (
      <>
        <Step>A</Step>
        <Step split={split as 'before'}>
          B<Step>B.1</Step>
          <Step>B.2</Step>
        </Step>
        <Step>C</Step>
      </>
    );
    expect(splitOf(nested('before'))).toEqual([
      'Start of the slide',
      'A [page]',
      'B',
      'B.1',
      'B.2',
      'C [page]',
    ]);
    cleanup();
    // A bare `split` makes a page of the step when it's shown.
    expect(splitOf(nested(''))).toEqual([
      'Start of the slide',
      'A',
      'B [page]',
      'B.1',
      'B.2',
      'C [page]',
    ]);
    cleanup();
    expect(splitOf(nested('last none'))).toEqual([
      'Start of the slide',
      'A',
      'B',
      'B.1',
      'B.2 [page]',
      'C [page]',
    ]);
  });

  it('passes the mode on to nested steps, which can change it', () => {
    expect(
      splitOf(
        <Step split="none">
          A<Step only>A.1</Step>
          <Step only split="auto">
            A.2
          </Step>
          <Step only>A.3</Step>
        </Step>,
      ),
    ).toEqual(['Start of the slide', 'A', 'A.1', 'A.2 [page]', 'A.3 [page]']);
  });

  it('takes the mode of steps and pages from the slide', () => {
    const steps = (
      <>
        <Step only>A</Step>
        <Step only group="parse">
          B
        </Step>
        <Step only>C</Step>
      </>
    );
    expect(splitOf(steps, { split: 'none' })).toEqual([
      'Start of the slide',
      'A',
      'B',
      'C [page]',
    ]);
    cleanup();
    expect(splitOf(steps, { split: '0, parse' })).toEqual([
      'Start of the slide [page]',
      'A',
      'B [page]',
      'C [page]',
    ]);
  });

  it('makes a page of each step of `Steps`, unless they need none', () => {
    expect(
      splitOf(
        <Steps count={2} title="Figure">
          {({ stepIndex }) => `Figure ${String(stepIndex)}`}
        </Steps>,
      ),
    ).toEqual([
      'Start of the slide [page]',
      'Figure (1/2) [page]',
      'Figure (2/2) [page]',
    ]);
    cleanup();
    expect(
      splitOf(
        <Steps count={2} split="none">
          Figure
        </Steps>,
      ),
    ).toEqual(['Start of the slide', 'Figure (1/2)', 'Figure (2/2) [page]']);
  });

  it('makes a page without overlays of the content they may cover', () => {
    expect(
      splitOf(
        <>
          <Step>Figure</Step>
          <Step overlay>First note</Step>
          <Step overlay="">Second note</Step>
          <Step>Text</Step>
        </>,
      ),
    ).toEqual([
      'Start of the slide',
      'Figure [page]',
      'First note [overlay]',
      'Second note [overlay]',
      'Text [page]',
    ]);
  });

  it('makes no page without overlays if content is only shown with them', () => {
    expect(
      splitOf(
        <>
          <Step overlay>Note</Step>
          <Step>Text</Step>
        </>,
      ),
    ).toEqual(['Start of the slide [page]', 'Note [overlay]', 'Text [page]']);
  });

  it('makes no page without overlays of content shown along with them', () => {
    expect(
      splitOf(
        <>
          <Step only>
            Text
            <Step only with="initial" overlay>
              Note
            </Step>
            <Step split="none">More</Step>
          </Step>
          <Step>End</Step>
        </>,
      ),
    ).toEqual([
      'Start of the slide [page]',
      'Text [page]',
      'More',
      'End [page]',
    ]);
  });

  it('only makes pages of steps in the range of the slide', () => {
    expect(
      splitOf(
        <>
          <Step only>A</Step>
          <Step only>B</Step>
          <Step only>C</Step>
        </>,
        { from: '2' },
      ),
    ).toEqual(['Start of the slide', 'A', 'B [page]', 'C [page]']);
  });
});
