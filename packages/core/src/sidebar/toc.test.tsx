import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Deck } from '../deck/Deck.tsx';
import { Slide } from '../slide/Slide.tsx';
import { useSlideState } from '../state/useSlideState.ts';
import { Step } from '../steps/Step.tsx';
import {
  findCurrentEntry,
  resolveToc,
  type TocEntry,
} from '../deck/tableOfContents.ts';

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
        hasSlide: true,
        title: 'A',
        children: [
          {
            slideIndex: 1,
            hasSlide: true,
            title: 'Slide 2',
            standIn: true,
            children: [],
          },
        ],
      },
      { slideIndex: 2, hasSlide: true, title: 'X', children: [] },
    ]);
    expect(findCurrentEntry(toc, 1)).toBe(1);
    expect(findCurrentEntry(toc, 2)).toBe(2);
  });

  it('resolves entries without slides to their first nested slide', () => {
    const toc = resolveToc(
      [
        { title: 'Group', children: [{ slide: 'missing' }, { slide: 2 }] },
        { title: 'Empty', children: [{ slide: 'missing' }] },
      ],
      slides,
      ['a', undefined, 'c'],
    );
    expect(toc).toEqual([
      {
        slideIndex: 2,
        hasSlide: false,
        title: 'Group',
        children: [{ slideIndex: 2, hasSlide: true, title: 'C', children: [] }],
      },
    ]);
    // Only the entry of the slide is current.
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

describe('TocList', () => {
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
    ).toEqual(['Introduction', 'Motivation', 'Custom', 'Slide 4']);
    // Collapsing the only expanded section hides the sidebar.
    await user.click(screen.getByRole('button', { name: 'Contents' }));
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Steps' })).toBeNull();
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

  it('shows titles that are cut off in a tooltip', async () => {
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
    const long = within(nav).getByText('Motivation');
    // jsdom doesn't lay out, so the title is cut off as far as it knows.
    Object.defineProperties(long, {
      scrollWidth: { value: 300 },
      clientWidth: { value: 100 },
    });
    await user.hover(within(nav).getByText('Custom'));
    await user.hover(long);
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip.textContent).toBe('Motivation');
    await user.unhover(long);
    await user.hover(within(nav).getByText('Custom'));
    await waitFor(() => {
      expect(screen.queryByRole('tooltip')).toBeNull();
    });
  });

  it('links recaps and the slides they recap', async () => {
    const user = userEvent.setup();
    render(
      <Deck
        toc={[{ slide: 'a' }, { slide: 1 }, { slide: 2 }, { slide: 3 }]}
        defaultShowToc
      >
        <Slide id="a" title="A" spare />
        <Slide title="B" />
        <Slide recap="a" />
        <Slide recap="a" />
      </Deck>,
    );
    const nav = screen.getByRole('navigation', { name: 'Table of contents' });
    await user.click(
      within(nav).getByRole('button', { name: 'Go to first recap' }),
    );
    expect(window.location.hash).toBe('#a-recap');
    const toOriginal = within(nav).getAllByRole('button', {
      name: 'Go to recapped slide',
    });
    expect(toOriginal).toHaveLength(2);
    const [, fromSecondRecap] = toOriginal;
    if (fromSecondRecap === undefined) {
      throw new Error('No link from the second recap');
    }
    await user.click(fromSecondRecap);
    expect(window.location.hash).toBe('#a');
  });

  it('shows the steps of slides with steps', async () => {
    const user = userEvent.setup();
    render(
      <Deck toc={[{ slide: 0 }, { slide: 1 }, { slide: 2 }]} defaultShowToc>
        <Slide title="First" />
        <Slide id="second" title="Second">
          <Step>Later</Step>
        </Slide>
        <Slide recap="second" />
      </Deck>,
    );
    const nav = screen.getByRole('navigation', { name: 'Table of contents' });
    // Found when the deck is idle, without showing the slides.
    const [ofSecond, ofRecap] = await within(nav).findAllByRole('button', {
      name: 'Show steps',
    });
    if (ofSecond === undefined || ofRecap === undefined) {
      throw new Error('No buttons to show the steps');
    }
    expect(
      within(nav).getByRole('button', { name: 'Go to recapped slide' }),
    ).toBeDefined();
    expect(screen.queryByRole('navigation', { name: 'Steps' })).toBeNull();
    await user.click(ofSecond);
    expect(window.location.hash).toBe('#second');
    expect(screen.getByRole('navigation', { name: 'Steps' })).toBeDefined();
    // Stays on the slide and keeps its steps.
    await user.keyboard('{ArrowRight}');
    await user.click(ofSecond);
    expect(window.location.hash).toBe('#second&step=1');
    expect(screen.getByRole('navigation', { name: 'Steps' })).toBeDefined();
    await user.click(ofRecap);
    // Recaps continue from the steps shown on the slide.
    expect(window.location.hash).toBe('#second-recap&step=1');
  });

  it('resets the state of slides', async () => {
    const user = userEvent.setup();
    function Counter() {
      const [count, setCount] = useSlideState(0);
      return (
        <button
          type="button"
          onClick={() => {
            setCount(count + 1);
          }}
        >
          {`Count ${String(count)}`}
        </button>
      );
    }
    render(
      <Deck toc={[{ slide: 0 }, { slide: 1 }, { slide: 2 }]} defaultShowToc>
        <Slide title="First" />
        <Slide id="counter" title="Counter">
          <Counter />
          <Step>Later</Step>
        </Slide>
        <Slide recap="counter" />
      </Deck>,
    );
    const nav = screen.getByRole('navigation', { name: 'Table of contents' });
    // Only marked while there is nothing to reset.
    expect(
      await within(nav).findAllByRole('img', { name: 'Keeps your changes' }),
    ).toHaveLength(2);
    expect(
      within(nav).queryByRole('button', { name: 'Reset slide' }),
    ).toBeNull();
    const [counter] = within(nav).getAllByRole('button', { name: 'Counter' });
    if (counter === undefined) {
      throw new Error('No entry of the slide');
    }
    await user.click(counter);
    await user.click(screen.getByRole('button', { name: 'Count 0' }));
    await user.keyboard('{ArrowRight}');
    expect(window.location.hash).toBe('#counter&step=1');
    // The recap shares the state of the slide.
    const resets = within(nav).getAllByRole('button', {
      name: 'Reset slide',
    });
    expect(resets).toHaveLength(2);
    const [, ofRecap] = resets;
    if (ofRecap === undefined) {
      throw new Error('No buttons to reset the state');
    }
    await user.click(ofRecap);
    // The first step in the range of the recap, which continues the slide.
    expect(window.location.hash).toBe('#counter-recap&step=1');
    expect(screen.getByRole('button', { name: 'Count 0' })).toBeDefined();
    expect(
      within(nav).queryByRole('button', { name: 'Reset slide' }),
    ).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Count 0' }));
    const [again] = within(nav).getAllByRole('button', {
      name: 'Reset slide',
    });
    if (again === undefined) {
      throw new Error('No button to reset the state');
    }
    await user.click(again);
    expect(window.location.hash).toBe('#counter');
    expect(screen.getByRole('button', { name: 'Count 0' })).toBeDefined();
  });

  it('starts slides from the beginning', async () => {
    const user = userEvent.setup();
    render(
      <Deck toc={[{ slide: 0 }, { slide: 1 }]} defaultShowToc>
        <Slide title="First">
          <Step>Later</Step>
        </Slide>
        <Slide title="Second" />
      </Deck>,
    );
    await user.keyboard('{ArrowRight}{PageDown}');
    await user.click(
      within(screen.getByRole('navigation')).getByRole('button', {
        name: 'First',
      }),
    );
    expect(window.location.hash).toBe('#slide=1');
  });

  it('is toggled with t', async () => {
    const user = userEvent.setup();
    renderDeck();
    await user.keyboard('t');
    expect(screen.getByRole('navigation')).toBeDefined();
    await user.keyboard('T');
    expect(screen.queryByRole('navigation')).toBeNull();
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
