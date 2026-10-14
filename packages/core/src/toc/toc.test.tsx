import { cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Deck } from '../deck/Deck.tsx';
import { Slide } from '../slide/Slide.tsx';
import {
  findCurrentEntry,
  resolveToc,
  type TocEntry,
} from './tableOfContents.ts';

const TOC: TocEntry[] = [
  {
    slide: 'intro',
    children: [{ slide: 1 }, { slide: 2, title: 'Custom' }],
  },
  { slide: 3 },
];

function renderDeck(toc: TocEntry[] | undefined = TOC) {
  return render(
    <Deck toc={toc}>
      <Slide id="intro" master="section" title="Introduction" />
      <Slide title={<em>Motivation</em>} />
      <Slide title="Goals" />
      <Slide>Untitled</Slide>
    </Deck>,
  );
}

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.pointer({
    keys: '[MouseRight]',
    target: screen.getByRole('heading'),
  });
  return screen.findByRole('menu');
}

describe('resolveToc', () => {
  const slides = [
    <Slide key="a" title="A" />,
    <Slide key="b" />,
    <Slide key="c" title="C" />,
  ];

  it('resolves slides by id and index, and takes titles from the slides', () => {
    const toc = resolveToc(
      [
        { slide: 'a', children: [{ slide: 1 }] },
        { slide: 2, title: 'X' },
      ],
      slides,
      ['a', undefined, 'c'],
    );
    expect(toc).toEqual([
      {
        slideIndex: 0,
        title: 'A',
        children: [{ slideIndex: 1, title: 'Slide 2', children: [] }],
      },
      { slideIndex: 2, title: 'X', children: [] },
    ]);
    expect(findCurrentEntry(toc, 1)).toBe(1);
    expect(findCurrentEntry(toc, 2)).toBe(2);
  });

  it('leaves out entries of missing slides', () => {
    expect(
      resolveToc([{ slide: 'missing' }, { slide: 3 }, { slide: -1 }], slides, [
        'a',
      ]),
    ).toEqual([]);
  });
});

describe('TocSidebar', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '#');
  });

  afterEach(() => {
    cleanup();
  });

  it('is shown from the context menu', async () => {
    const user = userEvent.setup();
    renderDeck();
    expect(screen.queryByRole('navigation')).toBeNull();
    const menu = await openMenu(user);
    const item = within(menu).getByRole('menuitemcheckbox', {
      name: 'Table of contents',
    });
    expect(item.getAttribute('aria-checked')).toBe('false');
    await user.click(item);
    const nav = screen.getByRole('navigation', { name: 'Table of contents' });
    expect(
      within(nav)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['', 'Introduction', 'Motivation', 'Custom', 'Slide 4']);
    await user.click(
      within(nav).getByRole('button', { name: 'Close table of contents' }),
    );
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('goes to slides and highlights the current one', async () => {
    const user = userEvent.setup();
    render(
      <Deck toc={TOC} defaultShowToc>
        <Slide id="intro" title="Introduction" />
        <Slide title="Motivation" />
        <Slide title="Goals" />
        <Slide>Untitled</Slide>
      </Deck>,
    );
    const nav = screen.getByRole('navigation');
    const current = () =>
      within(nav)
        .getAllByRole('button')
        .find((button) => button.getAttribute('aria-current') === 'page')
        ?.textContent;
    expect(current()).toBe('Introduction');
    await user.click(within(nav).getByText('Custom'));
    expect(window.location.hash).toBe('#slide=3');
    expect(current()).toBe('Custom');
  });

  it('is disabled without a table of contents', async () => {
    const user = userEvent.setup();
    renderDeck([]);
    const menu = await openMenu(user);
    expect(
      within(menu)
        .getByRole('menuitemcheckbox', { name: 'Table of contents' })
        .getAttribute('aria-disabled'),
    ).toBe('true');
  });
});
