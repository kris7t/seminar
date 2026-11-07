import { createSlideTheme, Deck, Slide } from '@seminar/core';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { calloutClasses } from './Callout.tsx';
import { calloutAnchorClasses, CalloutDirective } from './CalloutDirective.tsx';
import { calloutTitleClasses } from './CalloutTitle.tsx';

describe('CalloutDirective', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '#');
  });

  afterEach(() => {
    cleanup();
  });

  it('points at the text, or holds blocks, by the form of the directive', () => {
    render(
      <Deck>
        <Slide title="Callout">
          <p>
            Before <CalloutDirective>Text</CalloutDirective> after
          </p>
          <p>
            Pointing <CalloutDirective for="name">Named</CalloutDirective>
          </p>
          <CalloutDirective directive="leaf" at="100,200">
            Leaf
          </CalloutDirective>
          <CalloutDirective directive="container">
            <p>First</p>
          </CalloutDirective>
        </Slide>
      </Deck>,
    );
    const originOf = (text: string) => {
      const origin = screen
        .getByText(text)
        .closest<HTMLElement>(`.${calloutClasses.origin}`);
      if (origin === null) throw new Error(`Missing origin for ${text}`);
      return origin;
    };
    // Callouts in the text mark their position with an anchor.
    expect(
      originOf('Text').previousElementSibling?.classList.contains(
        calloutAnchorClasses.root,
      ),
    ).toBe(true);
    expect(
      originOf('Named').previousElementSibling?.classList.contains(
        calloutAnchorClasses.root,
      ) ?? false,
    ).toBe(false);
    expect(
      document.querySelectorAll(`.${calloutAnchorClasses.root}`),
    ).toHaveLength(1);
    expect(originOf('Leaf').tagName).toBe('SPAN');
    expect(originOf('First').tagName).toBe('DIV');
  });

  it('lets the overrides of callouts use their owner state with an anchor', () => {
    const theme = createSlideTheme({
      components: {
        SeminarCallout: {
          styleOverrides: {
            root: ({ ownerState }) =>
              ownerState.variant === 'outlined' ? { letterSpacing: '3px' } : {},
          },
        },
        SeminarCalloutAnchor: {
          styleOverrides: { root: { width: 2 } },
        },
      },
    });
    render(
      <Deck theme={theme}>
        <Slide title="Callout">
          <p>
            Before <CalloutDirective variant="outlined">Text</CalloutDirective>
          </p>
        </Slide>
      </Deck>,
    );
    const root = screen
      .getByText('Text')
      .closest<HTMLElement>(`.${calloutClasses.root}`);
    if (root === null) throw new Error('Missing root');
    expect(getComputedStyle(root).letterSpacing).toBe('3px');
    const anchor = document.querySelector(`.${calloutAnchorClasses.root}`);
    if (anchor === null) throw new Error('Missing anchor');
    expect(getComputedStyle(anchor).width).toBe('2px');
  });

  it('shows the label of a container as a title styled by the theme', () => {
    const theme = createSlideTheme({
      components: {
        SeminarCalloutTitle: {
          defaultProps: { variant: 'h4' },
          styleOverrides: { root: { color: 'rgb(1, 2, 3)' } },
        },
      },
    });
    render(
      <Deck theme={theme}>
        <Slide title="Callout">
          <CalloutDirective directive="container" label="Note">
            <p>Body</p>
          </CalloutDirective>
        </Slide>
      </Deck>,
    );
    const title = screen.getByText('Note');
    expect(title.classList.contains(calloutTitleClasses.root)).toBe(true);
    expect(getComputedStyle(title).fontSize).toBe('32px');
    expect(getComputedStyle(title).color).toBe('rgb(1, 2, 3)');
    expect(getComputedStyle(title).textAlign).toBe('center');
    const content = title.parentElement;
    if (content === null) throw new Error('Missing content');
    expect(getComputedStyle(content).textAlign).toBe('left');
  });
});
