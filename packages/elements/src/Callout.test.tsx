import { createSlideTheme, Deck, Slide, Step, stepClasses } from '@slider/core';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Callout, calloutClasses } from './Callout.tsx';

declare module '@mui/material/styles' {
  interface Palette {
    accent: Palette['primary'];
  }

  interface PaletteOptions {
    accent?: PaletteOptions['primary'];
  }
}

declare module '@slider/core' {
  interface StepVariantOverrides {
    ghost: true;
  }
}

function calloutWithText(text: string): HTMLElement {
  const callout = screen
    .getByText(text)
    .closest<HTMLElement>(`.${calloutClasses.root}`);
  if (callout === null) throw new Error(`Missing callout for ${text}`);
  return callout;
}

describe('Callout', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '#');
  });

  afterEach(() => {
    cleanup();
  });

  it('is an inline scoped step by default', async () => {
    const user = userEvent.setup();
    render(
      <Deck>
        <Slide title="Callout">
          <Step group="parent">Parent</Step>
          <Callout in="parent" data-testid="callout">
            Detail
          </Callout>
          <Step>Next</Step>
        </Slide>
      </Deck>,
    );
    const callout = screen.getByTestId('callout');
    expect(callout.tagName).toBe('SPAN');
    expect(callout.classList).toContain(calloutClasses.root);
    const positioner = callout.parentElement;
    if (positioner === null) throw new Error('Missing callout positioner');
    expect(positioner.classList).toContain(calloutClasses.positioner);
    expect(getComputedStyle(positioner).position).toBe('absolute');
    const anchor = positioner.parentElement;
    if (anchor === null) throw new Error('Missing callout anchor');
    expect(anchor.classList).toContain(calloutClasses.anchor);
    expect(getComputedStyle(anchor).width).toBe('0px');
    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(callout.classList).not.toContain(stepClasses.hidden);
    await user.keyboard('{ArrowRight}');
    expect(callout.classList).toContain(stepClasses.hidden);
  });

  it('supports full variants and built-in or custom shorthands', async () => {
    const user = userEvent.setup();
    const theme = createSlideTheme({
      stepVariants: {
        ghost: { future: 'dimmed', past: 'hidden' },
      },
    });
    render(
      <Deck theme={theme}>
        <Slide title="Callouts">
          <Callout only>Only</Callout>
          <Callout variant="dim">Dim</Callout>
          <Callout ghost>Ghost</Callout>
        </Slide>
      </Deck>,
    );
    expect(calloutWithText('Ghost').classList).toContain(stepClasses.dimmed);
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');
    expect(calloutWithText('Only').classList).toContain(stepClasses.hidden);
    expect(calloutWithText('Dim').classList).toContain(stepClasses.dimmed);
    expect(calloutWithText('Ghost').hasAttribute('ghost')).toBe(false);
  });

  it('accepts compact absolute and relative attachment points', () => {
    render(
      <Deck>
        <Slide title="Callout">
          <Callout
            at="640,360"
            shift="10,-10"
            angle={0}
            offset={20}
            stemOffset={0.5}
            width={300}
          >
            Positioned
          </Callout>
        </Slide>
      </Deck>,
    );
    const positioner = calloutWithText('Positioned').parentElement;
    if (positioner === null) throw new Error('Missing callout positioner');
    expect(positioner.style.transform).toBe('translate(330px, 318px)');
  });

  it('takes its geometry and palette color from theme default props', () => {
    const theme = createSlideTheme({
      palette: {
        accent: { main: '#123456', contrastText: '#ffffff' },
      },
      components: {
        SliderCallout: {
          defaultProps: {
            color: 'accent',
            width: 420,
            radius: 24,
            stemSize: 52,
          },
        },
      },
    });
    render(
      <Deck theme={theme}>
        <Slide title="Callout">
          <Callout>Themed</Callout>
        </Slide>
      </Deck>,
    );
    const callout = calloutWithText('Themed');
    const positioner = callout.parentElement;
    if (positioner === null) throw new Error('Missing callout positioner');
    expect(getComputedStyle(positioner).width).toBe('420px');
    const background = callout.querySelector<SVGElement>(
      `.${calloutClasses.background}`,
    );
    if (background === null) throw new Error('Missing callout background');
    expect(getComputedStyle(background).fill).toBe('rgb(18, 52, 86)');
    expect(background.querySelector('path')?.getAttribute('d')).toContain(
      'M 24 0',
    );
  });
});
