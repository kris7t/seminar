import { createSlideTheme, Deck, Slide, Step, stepClasses } from '@slider/core';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Callout, calloutClasses } from './Callout.tsx';
import { calloutTitleClasses } from './CalloutTitle.tsx';

declare module './Callout.tsx' {
  interface CalloutVariantOverrides {
    soft: true;
  }
}

declare module '@mui/material/styles' {
  interface Palette {
    accent: Palette['primary'];
  }

  interface PaletteOptions {
    accent?: PaletteOptions['primary'];
  }
}

declare module '@slider/core' {
  interface StepBehaviorOverrides {
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

  it('supports full behaviors and built-in or custom shorthands', async () => {
    const user = userEvent.setup();
    const theme = createSlideTheme({
      stepBehaviors: {
        ghost: { future: 'dimmed', past: 'hidden' },
      },
    });
    render(
      <Deck theme={theme}>
        <Slide title="Callouts">
          <Callout only>Only</Callout>
          <Callout behavior="dim">Dim</Callout>
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

  it('fits its text up to its maximum width without a width', () => {
    const theme = createSlideTheme({
      components: {
        SliderCallout: { defaultProps: { maxWidth: 240, align: 'left' } },
      },
    });
    render(
      <Deck theme={theme}>
        <Slide title="Callout">
          <Callout>Fitted</Callout>
          <Callout width={300} align="right">
            Fixed
          </Callout>
        </Slide>
      </Deck>,
    );
    const style = (text: string, slot: 'positioner' | 'content') => {
      const callout = calloutWithText(text);
      const element =
        slot === 'positioner'
          ? callout.parentElement
          : callout.querySelector(`.${calloutClasses.content}`);
      if (element === null) throw new Error(`Missing ${slot}`);
      return getComputedStyle(element);
    };
    expect(style('Fitted', 'positioner').width).toBe('max-content');
    expect(style('Fitted', 'positioner').maxWidth).toBe('240px');
    expect(style('Fitted', 'content').textAlign).toBe('left');
    expect(style('Fixed', 'positioner').width).toBe('300px');
    expect(style('Fixed', 'content').textAlign).toBe('right');
  });

  it('takes text colors of the palette', () => {
    render(
      <Deck>
        <Slide title="Callout">
          <Callout color="text.primary">Primary</Callout>
          <Callout color="text.secondary" variant="outlined">
            Secondary
          </Callout>
        </Slide>
      </Deck>,
    );
    const primary = getComputedStyle(calloutWithText('Primary'));
    // Opaque over the white paper, so that the slide doesn't show through.
    expect(primary.getPropertyValue('--SliderCallout-palette-main')).toBe(
      'rgb(33,33,33)',
    );
    expect(
      primary.getPropertyValue('--SliderCallout-palette-contrastText'),
    ).toBe('#fff');
    expect(
      getComputedStyle(calloutWithText('Secondary')).getPropertyValue(
        '--SliderCallout-palette-main',
      ),
    ).toBe('rgb(102,102,102)');
  });

  it('takes no room as a leaf or container directive', () => {
    render(
      <Deck>
        <Slide title="Callout">
          <Callout>Text</Callout>
          <Callout directive="leaf" at="100,200">
            Leaf
          </Callout>
          <Callout directive="container">
            <p>First</p>
            <p>Second</p>
          </Callout>
        </Slide>
      </Deck>,
    );
    const anchorOf = (text: string) => {
      const anchor = screen
        .getByText(text)
        .closest<HTMLElement>(`.${calloutClasses.anchor}`);
      if (anchor === null) throw new Error(`Missing anchor for ${text}`);
      return anchor;
    };
    expect(getComputedStyle(anchorOf('Text')).position).toBe('relative');
    expect(anchorOf('Text').tagName).toBe('SPAN');
    expect(getComputedStyle(anchorOf('Leaf')).position).toBe('absolute');
    expect(getComputedStyle(anchorOf('Leaf')).height).toBe('0px');
    expect(anchorOf('Leaf').tagName).toBe('SPAN');
    const container = anchorOf('First');
    expect(getComputedStyle(container).position).toBe('absolute');
    // Containers hold blocks.
    expect(container.tagName).toBe('DIV');
    expect(
      [...container.querySelectorAll('span')].filter(
        (element) => element.closest('svg') === null,
      ),
    ).toEqual([]);
  });

  it('shows a heading styled by the theme, and aligns containers left', () => {
    const theme = createSlideTheme({
      components: {
        SliderCalloutTitle: {
          defaultProps: { variant: 'h4' },
          styleOverrides: { root: { color: 'rgb(1, 2, 3)' } },
        },
      },
    });
    render(
      <Deck theme={theme}>
        <Slide title="Callout">
          <Callout directive="container" heading="Note">
            <p>Body</p>
          </Callout>
        </Slide>
      </Deck>,
    );
    const title = screen.getByText('Note');
    expect(title.classList.contains(calloutTitleClasses.root)).toBe(true);
    expect(getComputedStyle(title).fontSize).toBe('32px');
    expect(getComputedStyle(title).color).toBe('rgb(1, 2, 3)');
    const content = title.parentElement;
    if (content === null) throw new Error('Missing content');
    expect(getComputedStyle(content).textAlign).toBe('left');
    expect(getComputedStyle(title).textAlign).toBe('center');
  });

  it('centers its text by default', () => {
    render(
      <Deck>
        <Slide title="Callout">
          <Callout>Centered</Callout>
        </Slide>
      </Deck>,
    );
    const content = calloutWithText('Centered').querySelector(
      `.${calloutClasses.content}`,
    );
    if (content === null) throw new Error('Missing content');
    expect(getComputedStyle(content).textAlign).toBe('center');
  });

  it('casts the shadow of its elevation in the theme', () => {
    const theme = createSlideTheme({
      components: {
        SliderCallout: { defaultProps: { elevation: 2 } },
      },
    });
    render(
      <Deck theme={theme}>
        <Slide title="Callout">
          <Callout>Default</Callout>
          <Callout elevation={0}>Flat</Callout>
        </Slide>
      </Deck>,
    );
    const layers = (text: string) => {
      const path = calloutWithText(text).querySelector('path');
      const id = /^url\(#(.+)\)$/.exec(path?.getAttribute('filter') ?? '')?.[1];
      if (id === undefined) return [];
      return [
        ...(document.getElementById(id)?.querySelectorAll('feFlood') ?? []),
      ].map((flood) => flood.getAttribute('flood-color'));
    };
    // The layers of `theme.shadows[2]`.
    expect(layers('Default')).toEqual([
      'rgba(0,0,0,0.2)',
      'rgba(0,0,0,0.14)',
      'rgba(0,0,0,0.12)',
    ]);
    expect(layers('Flat')).toEqual([]);
    expect(calloutWithText('Flat').querySelector('filter')).toBeNull();
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
    expect(
      getComputedStyle(callout).getPropertyValue(
        '--SliderCallout-palette-main',
      ),
    ).toBe('#123456');
    expect(getComputedStyle(background).fill).toBe(
      'var(--SliderCallout-background)',
    );
    expect(background.querySelector('path')?.getAttribute('d')).toContain(
      'M 24 0',
    );
  });

  it('applies palette colors to filled and outlined variants', () => {
    const theme = createSlideTheme({
      palette: {
        accent: { main: '#123456', contrastText: '#ffffff' },
      },
    });
    render(
      <Deck theme={theme}>
        <Slide title="Callouts">
          <Callout color="accent">Filled</Callout>
          <Callout color="accent" variant="outlined">
            Outlined
          </Callout>
        </Slide>
      </Deck>,
    );
    const filled = getComputedStyle(calloutWithText('Filled'));
    expect(filled.getPropertyValue('--SliderCallout-palette-main')).toBe(
      '#123456',
    );
    expect(filled.getPropertyValue('--SliderCallout-color')).toBe(
      'var(--SliderCallout-palette-contrastText)',
    );
    expect(filled.getPropertyValue('--SliderCallout-outline-width')).toBe('0');

    const outlined = getComputedStyle(calloutWithText('Outlined'));
    expect(outlined.getPropertyValue('--SliderCallout-background')).toBe(
      theme.palette.background.paper,
    );
    expect(outlined.getPropertyValue('--SliderCallout-color')).toBe(
      'var(--SliderCallout-palette-main)',
    );
    expect(outlined.getPropertyValue('--SliderCallout-outline')).toBe(
      'var(--SliderCallout-palette-main)',
    );
    expect(outlined.getPropertyValue('--SliderCallout-outline-width')).toBe(
      '2',
    );
  });

  it('lets slot overrides use the variant, color, and palette shades', () => {
    const theme = createSlideTheme({
      palette: {
        accent: {
          main: '#123456',
          light: '#456789',
          dark: '#091a2b',
          contrastText: '#ffffff',
        },
      },
      components: {
        SliderCallout: {
          styleOverrides: {
            background: ({ theme: styleTheme, ownerState }) =>
              ownerState.variant === 'filled' && ownerState.color === 'accent'
                ? {
                    stroke: styleTheme.palette.accent.dark,
                    strokeWidth: 3,
                  }
                : {},
          },
        },
      },
    });
    render(
      <Deck theme={theme}>
        <Slide title="Callout">
          <Callout color="accent">Dark outline</Callout>
        </Slide>
      </Deck>,
    );
    const background = calloutWithText('Dark outline').querySelector(
      `.${calloutClasses.background}`,
    );
    if (background === null) throw new Error('Missing callout background');
    expect(getComputedStyle(background).stroke).toBe('rgb(9, 26, 43)');
    expect(getComputedStyle(background).strokeWidth).toBe('3');
  });

  it('lets themes extend variants and override their CSS', () => {
    const theme = createSlideTheme({
      components: {
        SliderCallout: {
          variants: [
            {
              props: { variant: 'outlined' },
              style: { '--SliderCallout-outline-width': 6 },
            },
            {
              props: { variant: 'soft' },
              style: {
                '--SliderCallout-background': '#abcdef',
                '--SliderCallout-color': '#010203',
                '--SliderCallout-outline': '#fedcba',
                '--SliderCallout-outline-width': 4,
              },
            },
          ],
        },
      },
    });
    render(
      <Deck theme={theme}>
        <Slide title="Callout">
          <Callout variant="outlined">Overridden</Callout>
          <Callout variant="soft">Soft</Callout>
        </Slide>
      </Deck>,
    );
    expect(
      getComputedStyle(calloutWithText('Overridden')).getPropertyValue(
        '--SliderCallout-outline-width',
      ),
    ).toBe('6');
    const soft = getComputedStyle(calloutWithText('Soft'));
    expect(soft.getPropertyValue('--SliderCallout-background')).toBe('#abcdef');
    expect(soft.getPropertyValue('--SliderCallout-color')).toBe('#010203');
    expect(soft.getPropertyValue('--SliderCallout-outline')).toBe('#fedcba');
    expect(soft.getPropertyValue('--SliderCallout-outline-width')).toBe('4');
  });
});
