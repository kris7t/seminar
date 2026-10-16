import { createSlideTheme, Deck, Slide, Step, stepClasses } from '@slider/core';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Callout, calloutClasses } from './Callout.tsx';

declare module '@slider/core' {
  interface StepVariantOverrides {
    ghost: true;
  }
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
    expect(screen.getByText('Ghost').classList).toContain(stepClasses.dimmed);
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');
    expect(screen.getByText('Only').classList).toContain(stepClasses.hidden);
    expect(screen.getByText('Dim').classList).toContain(stepClasses.dimmed);
    expect(screen.getByText('Ghost').hasAttribute('ghost')).toBe(false);
  });
});
