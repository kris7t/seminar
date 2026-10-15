import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Slide, type SlideProps } from '../slide/Slide.tsx';
import { useSlideState } from '../state/useSlideState.ts';
import { Step } from '../steps/Step.tsx';
import { Deck } from './Deck.tsx';
import { resolveRecaps } from './recaps.ts';

/** Resolves the recaps of slides with `props`, returning their props. */
function resolve(...slides: SlideProps[]) {
  const elements = slides.map((props, index) => (
    // The slides never change, and are identified by their position.
    // eslint-disable-next-line @eslint-react/no-array-index-key
    <Slide key={index} {...props} />
  ));
  const { slides: resolved, recapOf } = resolveRecaps(
    elements,
    slides.map(({ id }) => id),
    new Map(),
  );
  return resolved.map((slide, index) => {
    const { title, id, from, after, to, before, fromLast, spare } = (
      slide as { props: SlideProps }
    ).props;
    return Object.fromEntries(
      Object.entries({
        title,
        id,
        from,
        after,
        to,
        before,
        fromLast,
        spare,
        recapOf: recapOf[index],
      }).filter(([, value]) => value !== undefined),
    );
  });
}

describe('resolveRecaps', () => {
  it('continues where the previous showing of the slide ended', () => {
    expect(
      resolve(
        { id: 'a', title: 'A', to: '1' },
        { recap: 'a', before: '3' },
        { recap: 'a' },
        { recap: 'a', id: 'again', from: '1', spare: true },
        { recap: 'again' },
      ),
    ).toEqual([
      { title: 'A', id: 'a', to: '1' },
      { title: 'A', id: 'a-recap', after: '1', before: '3', recapOf: 0 },
      { title: 'A', id: 'a-recap-2', from: '3', recapOf: 0 },
      { title: 'A', id: 'again', from: '1', spare: true, recapOf: 0 },
      // The previous showing showed all steps.
      { title: 'A', id: 'a-recap-3', fromLast: true, recapOf: 0 },
    ]);
  });

  it('ignores whether showings of the slide are spare', () => {
    expect(
      resolve(
        { id: 'a', title: 'A', to: '1', spare: true },
        { recap: 'a', to: '2', spare: true },
        { recap: 'a' },
      ).map(({ spare, after }) => [spare, after]),
    ).toEqual([
      [true, undefined],
      // Spare-ness isn't taken from the recapped slide.
      [true, '1'],
      // Continues after the spare recap, whose steps are shown as past.
      [undefined, '2'],
    ]);
  });

  it('recaps slides by the ids derived for recaps', () => {
    expect(
      resolve(
        { id: 'a', title: 'A' },
        { recap: 'a' },
        { recap: 'a-recap' },
      ).map(({ id, recapOf }) => [id, recapOf]),
    ).toEqual([
      ['a', undefined],
      ['a-recap', 0],
      ['a-recap-2', 0],
    ]);
  });

  it('keeps recaps of missing slides', () => {
    expect(resolve({ recap: 'missing', title: 'X' })).toEqual([{ title: 'X' }]);
  });
});

function Counter() {
  const [count, setCount] = useSlideState(0);
  return (
    <button
      type="button"
      onClick={() => {
        setCount(count + 1);
      }}
    >
      Count {count}
    </button>
  );
}

describe('recaps in a deck', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '#');
  });

  afterEach(() => {
    cleanup();
  });

  it('share the state but not the steps of the recapped slide', async () => {
    const user = userEvent.setup();
    render(
      <Deck>
        <Slide id="a" title="A" to="1">
          <Counter />
          <Step>One</Step>
          <Step>Two</Step>
        </Slide>
        <Slide title="Between" />
        <Slide recap="a" />
      </Deck>,
    );
    await user.click(screen.getByRole('button', { name: 'Count 0' }));
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');
    expect(window.location.hash).toBe('#a-recap&step=2');
    expect(screen.getByRole('button', { name: 'Count 1' })).toBeDefined();
    // The recapped slide keeps its own step.
    await user.keyboard('{PageUp}{PageUp}');
    expect(window.location.hash).toBe('#a&step=1');
  });
});
