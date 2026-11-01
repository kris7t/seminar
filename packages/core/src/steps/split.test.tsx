import { cleanup, render, screen, within } from '@testing-library/react';
import type { Theme } from '@mui/material/styles';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Deck } from '../deck/Deck.tsx';
import { Slide, type SlideProps } from '../slide/Slide.tsx';
import { Step } from './Step.tsx';
import { Steps } from './Steps.tsx';
import { useStep } from './useSteps.ts';

const MARKS: Record<string, string> = {
  'Exported as a page': 'page',
  'Covers other content': 'overlay',
  'Shown up front': 'initial',
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

  it('makes pages of elements of a group or stepper with their own appearances', () => {
    function Linked() {
      const handle = useStep();
      return (
        <>
          <Step with={handle}>Plain</Step>
          <Step only with={handle}>
            Only
          </Step>
        </>
      );
    }
    expect(
      splitOf(
        <>
          <Step group="a">A</Step>
          <Step only group="a">
            B
          </Step>
          <Linked />
          <Step>End</Step>
        </>,
      ),
    ).toEqual([
      'Start of the slide',
      'A B [page]',
      'Plain Only [page]',
      'End [page]',
    ]);
  });
});
