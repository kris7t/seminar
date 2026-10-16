import { cleanup, render } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Deck } from '../deck/Deck.tsx';
import type {
  SlideMaster,
  SlideTransitionProp,
} from '../masters/SlideMaster.ts';
import { Step } from '../steps/Step.tsx';
import { createSlideTheme } from '../theme/createSlideTheme.ts';
import { Slide } from './Slide.tsx';

import {
  SlideTransitions,
  TRANSITION_ATTRIBUTE,
  TRANSITION_FRAME_ATTRIBUTE,
} from './SlideTransitions.ts';

interface FakeTransition {
  /** Calls the update callback, as the browser does after the snapshots. */
  capture: () => Promise<void>;
  /** Ends the transition, as the browser does after the animation. */
  end: () => Promise<void>;
  skipped: boolean;
}

/**
 * Lets `target` start view transitions, which run their update callback and
 * end when the test says so.
 */
function fakeTransitions(target: object): FakeTransition[] {
  const started: FakeTransition[] = [];
  Object.assign(target, {
    startViewTransition: (update: () => Promise<void>) => {
      let finish: () => void = () => undefined;
      const finished = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const fake: FakeTransition = {
        capture: () => update(),
        end: async () => {
          finish();
          await finished;
          await Promise.resolve();
        },
        skipped: false,
      };
      started.push(fake);
      return {
        finished,
        ready: Promise.resolve(),
        updateCallbackDone: Promise.resolve(),
        skipTransition: () => {
          fake.skipped = true;
        },
      };
    },
  });
  return started;
}

function createFrame(): HTMLElement {
  const frame = document.createElement('div');
  document.body.append(frame);
  return frame;
}

describe('SlideTransitions', () => {
  afterEach(() => {
    document.body.replaceChildren();
    document.documentElement.removeAttribute(TRANSITION_ATTRIBUTE);
    delete (document as Partial<Document>).startViewTransition;
    vi.useRealTimers();
  });

  it('updates right away without view transitions', () => {
    const transitions = new SlideTransitions();
    transitions.register(createFrame());
    const update = vi.fn();
    transitions.run(update);
    expect(update).toHaveBeenCalledOnce();
    expect(transitions.running).toBe(false);
  });

  it('updates right away without frames', () => {
    fakeTransitions(document);
    const update = vi.fn();
    new SlideTransitions().run(update);
    expect(update).toHaveBeenCalledOnce();
  });

  it('fades only the frame in transitions of the document', async () => {
    const started = fakeTransitions(document);
    const transitions = new SlideTransitions();
    const frame = createFrame();
    transitions.register(frame);
    const update = vi.fn();
    transitions.run(update);
    expect(update).not.toHaveBeenCalled();
    expect(transitions.running).toBe(true);
    expect(document.documentElement.hasAttribute(TRANSITION_ATTRIBUTE)).toBe(
      true,
    );
    expect(frame.hasAttribute(TRANSITION_FRAME_ATTRIBUTE)).toBe(true);
    await started[0]?.capture();
    expect(update).toHaveBeenCalledOnce();
    await started[0]?.end();
    expect(transitions.running).toBe(false);
    expect(document.documentElement.hasAttribute(TRANSITION_ATTRIBUTE)).toBe(
      false,
    );
    expect(frame.hasAttribute(TRANSITION_FRAME_ATTRIBUTE)).toBe(false);
  });

  it('prefers transitions scoped to the frame', async () => {
    fakeTransitions(document);
    const transitions = new SlideTransitions();
    const frame = createFrame();
    const started = fakeTransitions(frame);
    transitions.register(frame);
    transitions.run(() => undefined);
    expect(started).toHaveLength(1);
    expect(frame.hasAttribute(TRANSITION_ATTRIBUTE)).toBe(true);
    expect(document.documentElement.hasAttribute(TRANSITION_ATTRIBUTE)).toBe(
      false,
    );
    await started[0]?.capture();
    await started[0]?.end();
    expect(frame.hasAttribute(TRANSITION_ATTRIBUTE)).toBe(false);
  });

  it('updates once every frame has its snapshot', async () => {
    const transitions = new SlideTransitions();
    const frames = [createFrame(), createFrame()];
    const [first, second] = frames.map((frame) => {
      transitions.register(frame);
      return fakeTransitions(frame);
    });
    const update = vi.fn();
    transitions.run(update);
    const captured = first?.[0]?.capture();
    expect(update).not.toHaveBeenCalled();
    await second?.[0]?.capture();
    await captured;
    expect(update).toHaveBeenCalledOnce();
  });

  it('keeps the order of quick updates', async () => {
    const transitions = new SlideTransitions();
    const frame = createFrame();
    const started = fakeTransitions(frame);
    transitions.register(frame);
    const updates: string[] = [];
    transitions.run(() => updates.push('first'));
    transitions.run(() => updates.push('second'));
    // The first update is applied before the second transition starts.
    expect(updates).toEqual(['first']);
    await started[0]?.capture();
    await started[1]?.capture();
    expect(updates).toEqual(['first', 'second']);
  });

  it('applies the update when skipped', () => {
    const transitions = new SlideTransitions();
    const frame = createFrame();
    const started = fakeTransitions(frame);
    transitions.register(frame);
    const update = vi.fn();
    transitions.run(update);
    transitions.skip();
    expect(update).toHaveBeenCalledOnce();
    expect(started[0]?.skipped).toBe(true);
  });

  it('applies the update if the browser never captures', () => {
    vi.useFakeTimers();
    const transitions = new SlideTransitions();
    const frame = createFrame();
    fakeTransitions(frame);
    transitions.register(frame);
    const update = vi.fn();
    transitions.run(update);
    vi.advanceTimersByTime(1000);
    expect(update).toHaveBeenCalledOnce();
  });

  it('stops fading unregistered frames', () => {
    const transitions = new SlideTransitions();
    const frame = createFrame();
    const started = fakeTransitions(frame);
    transitions.register(frame)();
    transitions.run(() => undefined);
    expect(started).toHaveLength(0);
  });

  describe('in a deck', () => {
    afterEach(() => {
      cleanup();
      window.history.replaceState(null, '', '#');
    });

    async function stepWith(theme?: ReturnType<typeof createSlideTheme>) {
      const started = fakeTransitions(document);
      const user = userEvent.setup();
      render(
        <Deck {...(theme === undefined ? {} : { theme })}>
          <Slide title="Steps">
            <Step>A</Step>
          </Slide>
        </Deck>,
      );
      await user.keyboard('{ArrowRight}');
      await started[0]?.capture();
      return started;
    }

    it('fades the slide between steps', async () => {
      expect(await stepWith()).toHaveLength(1);
    });

    function renderSlides(
      second: { transition?: SlideTransitionProp; master?: SlideMaster } = {},
      theme?: ReturnType<typeof createSlideTheme>,
    ) {
      const started = fakeTransitions(document);
      render(
        <Deck {...(theme === undefined ? {} : { theme })}>
          <Slide title="First">A</Slide>
          <Slide title="Second" {...second}>
            B
          </Slide>
        </Deck>,
      );
      return started;
    }

    it('fades from one slide to another', async () => {
      const started = renderSlides();
      const user = userEvent.setup();
      await user.keyboard('{PageDown}');
      expect(started).toHaveLength(1);
      expect(document.documentElement.getAttribute(TRANSITION_ATTRIBUTE)).toBe(
        'slide',
      );
    });

    it('lets either slide turn off the fade', async () => {
      const started = renderSlides({ transition: 'cut' });
      const user = userEvent.setup();
      // Into the slide, and out of it.
      await user.keyboard('{PageDown}');
      await user.keyboard('{PageUp}');
      expect(started).toHaveLength(0);
    });

    it('cuts fades into a slide', async () => {
      const started = renderSlides({ transition: 'cut-in' });
      const user = userEvent.setup();
      await user.keyboard('{PageDown}');
      expect(started).toHaveLength(0);
      // Going back leaves it.
      await user.keyboard('{PageUp}');
      expect(started).toHaveLength(1);
    });

    it('cuts fades with the slide before it, both ways', async () => {
      const started = renderSlides({ transition: 'cut-before' });
      const user = userEvent.setup();
      await user.keyboard('{PageDown}');
      await user.keyboard('{PageUp}');
      expect(started).toHaveLength(0);
    });

    it('keeps fades with the slide before it when cutting after it', async () => {
      const started = renderSlides({ transition: 'cut-after cut-out' });
      const user = userEvent.setup();
      await user.keyboard('{PageDown}');
      expect(started).toHaveLength(1);
    });

    it('lets the master of the slide turn off the fade', async () => {
      const Cut: SlideMaster = ({ children }) => <div>{children}</div>;
      Cut.transition = 'cut';
      const started = renderSlides({ master: Cut });
      await userEvent.setup().keyboard('{PageDown}');
      expect(started).toHaveLength(0);
    });

    it('changes slides at once without a duration', async () => {
      const theme = createSlideTheme({ slideTransition: { duration: 0 } });
      const started = renderSlides({}, theme);
      await userEvent.setup().keyboard('{PageDown}');
      expect(started).toHaveLength(0);
    });

    it('changes steps at once without a duration', async () => {
      const theme = createSlideTheme({ stepTransition: { duration: 0 } });
      expect(await stepWith(theme)).toHaveLength(0);
    });
  });
});
