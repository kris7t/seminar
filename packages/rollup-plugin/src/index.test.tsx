import { createSlideTheme } from '@slider/core';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import Talk, { frontmatter } from './fixtures/talk.deck.mdx';

function SectionMaster({ title }: { title?: unknown }): JSX.Element {
  return <h1 data-master="section">{String(title)}</h1>;
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
    render(
      <Talk theme={createSlideTheme({ master: { section: SectionMaster } })} />,
    );
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
});
