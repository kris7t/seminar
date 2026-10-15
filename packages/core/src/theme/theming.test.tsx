import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ThemeProvider } from '@mui/material';

import { Deck } from '../deck/Deck.tsx';
import { contentMasterClasses } from '../masters/ContentMaster.tsx';
import { titleMasterClasses } from '../masters/TitleMaster.tsx';
import {
  createPointerStore,
  MirroredPointer,
  mirroredPointerClasses,
} from '../presentation/pointer.tsx';
import { Slide } from '../slide/Slide.tsx';
import { slideNumberClasses } from '../slide/SlideNumber.tsx';
import { createSlideTheme } from './createSlideTheme.ts';

describe('theming', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '#');
  });

  afterEach(() => {
    cleanup();
  });

  it('adds utility classes to the content master', () => {
    const { container } = render(
      <Deck>
        <Slide title="Content">Body</Slide>
      </Deck>,
    );
    for (const className of Object.values(contentMasterClasses)) {
      expect(container.querySelector(`.${className}`)).not.toBeNull();
    }
    expect(
      container.querySelector(`.${slideNumberClasses.root}`),
    ).not.toBeNull();
  });

  it('adds utility classes to the title master', () => {
    const { container } = render(
      <Deck>
        <Slide master="title" title="Title">
          Subtitle
        </Slide>
      </Deck>,
    );
    for (const className of Object.values(titleMasterClasses)) {
      expect(container.querySelector(`.${className}`)).not.toBeNull();
    }
  });

  it('applies default props from the theme', () => {
    const theme = createSlideTheme({
      components: {
        SliderContentMaster: {
          defaultProps: { showSlideNumber: false },
        },
      },
    });
    render(
      <Deck theme={theme}>
        <Slide title="Content" />
      </Deck>,
    );
    expect(screen.queryByText('1 / 1')).toBeNull();
  });

  it('applies style overrides from the theme', () => {
    const theme = createSlideTheme({
      components: {
        SliderContentMaster: {
          styleOverrides: { title: { color: 'rgb(0, 0, 255)' } },
        },
        SliderSlideNumber: {
          styleOverrides: { root: { color: 'rgb(255, 0, 0)' } },
        },
      },
    });
    render(
      <Deck theme={theme}>
        <Slide title="Content" />
        <Slide master="title" title="Title" />
      </Deck>,
    );
    expect(getComputedStyle(screen.getByText('Content')).color).toBe(
      'rgb(0, 0, 255)',
    );
    expect(getComputedStyle(screen.getByText('1 / 2')).color).toBe(
      'rgb(255, 0, 0)',
    );
  });

  it('applies style overrides to the title master', () => {
    window.history.replaceState(null, '', '#slide=2');
    const theme = createSlideTheme({
      components: {
        SliderTitleMaster: {
          styleOverrides: { subtitle: { color: 'rgb(0, 128, 0)' } },
        },
      },
    });
    render(
      <Deck theme={theme}>
        <Slide title="Content" />
        <Slide master="title" title="Title">
          Subtitle
        </Slide>
      </Deck>,
    );
    expect(getComputedStyle(screen.getByText('Subtitle')).color).toBe(
      'rgb(0, 128, 0)',
    );
  });

  it('applies variants from the theme', () => {
    const theme = createSlideTheme({
      components: {
        SliderContentMaster: {
          defaultProps: { showSlideNumber: false },
          variants: [
            {
              props: { showSlideNumber: false },
              style: {
                [`& .${contentMasterClasses.title}`]: {
                  color: 'rgb(255, 0, 255)',
                },
              },
            },
          ],
        },
      },
    });
    render(
      <Deck theme={theme}>
        <Slide title="Content" />
      </Deck>,
    );
    expect(getComputedStyle(screen.getByText('Content')).color).toBe(
      'rgb(255, 0, 255)',
    );
  });

  it('applies style overrides to the pointer', () => {
    const theme = createSlideTheme({
      components: {
        SliderPointer: {
          styleOverrides: {
            cursor: { '--SliderPointer-fill': 'yellow' },
            laser: { width: 32 },
          },
        },
      },
    });
    const store = createPointerStore();
    store.set({ x: 10, y: 20, cursor: 'default', idle: false });
    const { container, rerender } = render(
      <ThemeProvider theme={theme}>
        <MirroredPointer store={store} mode="mirror" />
      </ThemeProvider>,
    );
    const cursor = container.querySelector(`.${mirroredPointerClasses.cursor}`);
    expect(
      cursor === null
        ? undefined
        : getComputedStyle(cursor).getPropertyValue('--SliderPointer-fill'),
    ).toBe('yellow');
    rerender(
      <ThemeProvider theme={theme}>
        <MirroredPointer store={store} mode="laser" />
      </ThemeProvider>,
    );
    const laser = container.querySelector(`.${mirroredPointerClasses.laser}`);
    expect(laser === null ? undefined : getComputedStyle(laser).width).toBe(
      '32px',
    );
  });
});
