import { createSlideTheme, type SlideMasterProps } from '@slider/core';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import Plain, {
  frontmatter as plainFrontmatter,
} from './fixtures/plain.deck.mdx';
import Talk, { frontmatter } from './fixtures/talk.deck.mdx';

function OverrideMaster({ title }: SlideMasterProps): JSX.Element {
  return <h1 data-master="override">{title}</h1>;
}

describe('.deck.mdx', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '#');
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the slides of the document', async () => {
    const user = userEvent.setup();
    render(<Talk />);
    expect(screen.getByRole('heading').textContent).toBe('A talk about slides');
    expect(screen.getByText('talk').tagName).toBe('EM');
    expect(window.location.hash).toBe('#a-talk-about-slides');

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('heading').textContent).toBe('Introduction');
    await user.keyboard('{ArrowRight}');
    expect(window.location.hash).toBe('#introduction&step=1');

    await user.keyboard('{ArrowRight}');
    expect(window.location.hash).toBe('#results');
    expect(screen.getByRole('heading').getAttribute('data-master')).toBe(
      'section',
    );

    await user.keyboard('{ArrowRight}');
    expect(window.location.hash).toBe('#end');
    expect(screen.getByText('Thank you')).toBeDefined();
  });

  it('takes deck settings from the frontmatter', async () => {
    const user = userEvent.setup();
    expect(frontmatter).toEqual({
      title: 'A talk about slides',
      mouseNavigation: false,
      theme: './theme.tsx',
    });
    render(<Talk />);
    await user.click(screen.getByText('Someone, somewhere'));
    expect(window.location.hash).toBe('#a-talk-about-slides');
  });

  it('lets props override the frontmatter', async () => {
    const user = userEvent.setup();
    render(<Talk defaultMouseNavigation />);
    await user.click(screen.getByText('Someone, somewhere'));
    expect(window.location.hash).toBe('#introduction');
  });

  it('lets props override the theme', () => {
    window.history.replaceState(null, '', '#results');
    render(
      <Talk
        theme={createSlideTheme({ master: { section: OverrideMaster } })}
      />,
    );
    expect(screen.getByRole('heading').getAttribute('data-master')).toBe(
      'override',
    );
  });

  it('uses the default theme and mouse navigation', async () => {
    const user = userEvent.setup();
    expect(plainFrontmatter).toEqual({
      title: 'Plain deck',
      mouseNavigation: true,
      theme: '@slider/theme-default',
    });
    render(<Plain />);
    expect(screen.getByRole('heading').textContent).toBe('Plain deck');
    await user.click(screen.getByText('Uses the default theme'));
    expect(window.location.hash).toBe('#plain-deck');
  });
});
