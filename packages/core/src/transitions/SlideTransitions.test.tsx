import { act, cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  use,
  useEffect,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import { Deck } from '../deck/Deck.tsx';
import type { SlideMaster } from '../masters/SlideMaster.ts';
import { Step } from '../steps/Step.tsx';
import { StepStoreContext } from '../steps/StepStoreContext.ts';
import { createSlideTheme } from '../theme/createSlideTheme.ts';
import type { CutProp } from './fades.ts';
import { Slide } from '../slide/Slide.tsx';
import { useSlideUpdate, useTransitionHold } from './settling.ts';
import { useStepTransition } from './useStepTransition.ts';

import {
  DURATION_PROPERTY,
  SETTLE_DEADLINE,
  SlideTransitions,
  SlideTransitionsContext,
  TRANSITION_ATTRIBUTE,
  TRANSITION_FRAME_ATTRIBUTE,
} from './SlideTransitions.ts';

interface FakeTransition {
  /** Calls the update callback, as the browser does after the snapshots. */
  capture: () => Promise<void>;
  /** Ends the transition, as the browser does after the animation. */
  end: () => Promise<void>;
  skipped: boolean;
  /** The duration of the fade when the transition started, e.g., `0ms`. */
  duration: string;
  /** The kind of the transition, e.g., `slide`. */
  kind: string | null;
}

/**
 * Lets `target` start view transitions, which run their update callback and
 * end when the test says so. `HTMLElement.prototype` lets every element start
 * transitions scoped to itself.
 */
function fakeTransitions(target: object): FakeTransition[] {
  const started: FakeTransition[] = [];
  Object.assign(target, {
    startViewTransition(
      this: Document | HTMLElement,
      update: () => Promise<void>,
    ) {
      const scope = this instanceof Document ? this.documentElement : this;
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
        duration: scope.style.getPropertyValue(DURATION_PROPERTY),
        kind: scope.getAttribute(TRANSITION_ATTRIBUTE),
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

function durations(started: readonly FakeTransition[]): string[] {
  return started.map(({ duration }) => duration);
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
    document.documentElement.style.removeProperty(DURATION_PROPERTY);
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

  it('holds frames that only hold, and cuts them', () => {
    const transitions = new SlideTransitions();
    const frame = createFrame();
    const panel = createFrame();
    const started = fakeTransitions(frame);
    const held = fakeTransitions(panel);
    transitions.register(frame);
    transitions.register(panel, { holdOnly: true });
    transitions.run(() => undefined, 'step', 300);
    expect(durations(started)).toEqual(['300ms']);
    expect(durations(held)).toEqual(['0ms']);
  });

  it('leaves frames that only hold to transitions of the document', () => {
    const started = fakeTransitions(document);
    const transitions = new SlideTransitions();
    const frame = createFrame();
    transitions.register(frame);
    transitions.register(createFrame(), { holdOnly: true });
    transitions.run(() => undefined);
    expect(started).toHaveLength(1);
  });

  it('stops fading unregistered frames', () => {
    const transitions = new SlideTransitions();
    const frame = createFrame();
    const started = fakeTransitions(frame);
    transitions.register(frame)();
    transitions.run(() => undefined);
    expect(started).toHaveLength(0);
  });

  describe('settling', () => {
    /** Runs `update` in a transition, and resolves when it's shown. */
    function runShown(transitions: SlideTransitions, update: () => void) {
      const frame = createFrame();
      const started = fakeTransitions(frame);
      transitions.register(frame);
      transitions.run(update);
      const begin = performance.now();
      let shownAfter: number | undefined;
      const shown = started[0]?.capture().then(() => {
        shownAfter = performance.now() - begin;
      });
      return { frame, shown, shownAfter: () => shownAfter };
    }

    const sleep = (ms: number) =>
      new Promise((resolve) => {
        setTimeout(resolve, ms);
      });

    it('shows the change once nothing holds it', async () => {
      const transitions = new SlideTransitions();
      let release: () => void = () => undefined;
      const { shown, shownAfter } = runShown(transitions, () => {
        release = transitions.hold(1000);
      });
      await sleep(50);
      expect(shownAfter()).toBeUndefined();
      release();
      await shown;
      expect(shownAfter()).toBeDefined();
    });

    it('shows the change at the greatest deadline of the holds', async () => {
      const transitions = new SlideTransitions();
      const { shown, shownAfter } = runShown(transitions, () => {
        transitions.hold(10);
        transitions.hold(SETTLE_DEADLINE + 100);
      });
      await shown;
      expect(shownAfter()).toBeGreaterThanOrEqual(SETTLE_DEADLINE + 90);
    });

    it('ignores holds outside of changes', async () => {
      const transitions = new SlideTransitions();
      transitions.hold(1000);
      const { shown, shownAfter } = runShown(transitions, () => undefined);
      await shown;
      expect(shownAfter()).toBeLessThan(SETTLE_DEADLINE);
    });

    it('waits until the slide stops changing', async () => {
      const transitions = new SlideTransitions();
      let changes = 0;
      // Like renders that set off other renders, one task after another.
      const change = () => {
        frame.textContent = String(changes);
        changes += 1;
        if (changes < 5) setTimeout(change);
      };
      const { frame, shown, shownAfter } = runShown(transitions, () => {
        setTimeout(change);
      });
      await shown;
      expect(changes).toBe(5);
      expect(shownAfter()).toBeLessThan(SETTLE_DEADLINE);
    });

    it('measures again while settling', async () => {
      const transitions = new SlideTransitions();
      const measure = vi.fn();
      transitions.subscribeToMeasure(measure);
      const { shown } = runShown(transitions, () => undefined);
      await shown;
      expect(measure).toHaveBeenCalled();
    });

    it('shows the change when skipped', async () => {
      const transitions = new SlideTransitions();
      const { shown, shownAfter } = runShown(transitions, () => {
        transitions.hold(1000);
      });
      await sleep(20);
      transitions.skip();
      await shown;
      expect(shownAfter()).toBeLessThan(SETTLE_DEADLINE);
    });

    it('finishes the animations of a change when interrupted', async () => {
      const transitions = new SlideTransitions();
      const { frame, shown } = runShown(transitions, () => undefined);
      await shown;
      const animation = (endTime: number) => ({
        startTime: 10,
        effect: { getComputedTiming: () => ({ endTime }) },
        finish: vi.fn(),
      });
      const finite = animation(300);
      const endless = animation(Number.POSITIVE_INFINITY);
      Object.assign(frame, { getAnimations: () => [finite, endless] });
      // The transition is still running, e.g., fading.
      transitions.run(() => undefined);
      expect(finite.finish).toHaveBeenCalledOnce();
      expect(endless.finish).not.toHaveBeenCalled();
    });

    it('starts the animations of a change over once it is shown', async () => {
      const transitions = new SlideTransitions();
      const animation = {
        startTime: 10,
        currentTime: 120,
        playState: 'running',
        effect: { getComputedTiming: () => ({ endTime: 300 }) },
        pause() {
          this.playState = 'paused';
        },
        play() {
          this.playState = 'running';
        },
      };
      const { shown } = runShown(transitions, () => {
        // The change sets off an animation of the frame.
        Object.assign(document.body.lastElementChild ?? {}, {
          getAnimations: () => [animation],
        });
      });
      expect(animation.playState).toBe('paused');
      await shown;
      expect(animation.currentTime).toBe(0);
      expect(animation.playState).toBe('running');
    });

    it('tells that an interrupted change changed at once', async () => {
      const transitions = new SlideTransitions();
      const frame = createFrame();
      const started = fakeTransitions(frame);
      transitions.register(frame);
      transitions.change(() => undefined, {
        kind: 'step',
        duration: 300,
        forward: true,
        slideIndex: 0,
        path: [1],
      });
      await started[0]?.capture();
      expect(transitions.getChange()?.duration).toBe(300);
      transitions.skip();
      expect(transitions.getChange()).toMatchObject({
        duration: 300,
        path: [1],
        shown: true,
        skipped: true,
      });
    });

    it('changes at once for immediate changes', () => {
      const transitions = new SlideTransitions();
      const frame = createFrame();
      const started = fakeTransitions(frame);
      transitions.register(frame);
      const update = vi.fn();
      transitions.change(update, {
        kind: 'slide',
        duration: 150,
        forward: true,
        slideIndex: 1,
        immediate: true,
      });
      expect(update).toHaveBeenCalledOnce();
      expect(started).toHaveLength(0);
    });
  });

  describe('useSlideUpdate', () => {
    afterEach(cleanup);

    /** Like a formula, which renders a moment after it's mounted. */
    function Loading() {
      const [ready, setReady] = useState(false);
      useTransitionHold(!ready, { deadline: 1000 });
      useEffect(() => {
        const timeout = setTimeout(() => {
          setReady(true);
        }, 50);
        return () => {
          clearTimeout(timeout);
        };
      }, []);
      return <span>{ready ? 'ready' : 'loading'}</span>;
    }

    it('cuts to the update once the slide is ready', async () => {
      const transitions = new SlideTransitions();
      const frame = createFrame();
      const started = fakeTransitions(frame);
      transitions.register(frame);
      let updateSlide: (update: () => void) => void = () => undefined;
      let show: () => void = () => undefined;
      function Widget() {
        const [shown, setShown] = useState(false);
        updateSlide = useSlideUpdate();
        show = () => {
          setShown(true);
        };
        return shown ? <Loading /> : null;
      }
      render(
        <SlideTransitionsContext value={transitions}>
          <Widget />
        </SlideTransitionsContext>,
        { container: frame },
      );
      updateSlide(() => {
        show();
      });
      expect(started).toHaveLength(1);
      expect(started[0]?.kind).toBe('step');
      expect(started[0]?.duration).toBe('0ms');
      let shown = false;
      const captured = started[0]?.capture().then(() => {
        shown = true;
      });
      expect(screen.getByText('loading')).toBeDefined();
      await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
      expect(shown).toBe(false);
      await act(() => captured);
      expect(shown).toBe(true);
      expect(screen.getByText('ready')).toBeDefined();
    });

    it('updates at once without view transitions', () => {
      const update = vi.fn();
      let updateSlide: (update: () => void) => void = () => undefined;
      function Widget() {
        updateSlide = useSlideUpdate();
        return null;
      }
      render(<Widget />);
      updateSlide(update);
      expect(update).toHaveBeenCalledOnce();
    });
  });

  describe('in a deck', () => {
    afterEach(() => {
      cleanup();
      window.history.replaceState(null, '', '#');
      delete (HTMLElement.prototype as { startViewTransition?: unknown })
        .startViewTransition;
    });

    /** Lets the deck start view transitions scoped to the slide. */
    const fakeScoped = () => fakeTransitions(HTMLElement.prototype);

    async function stepWith(theme?: ReturnType<typeof createSlideTheme>) {
      const started = fakeScoped();
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
      second: { cut?: CutProp; fade?: number; master?: SlideMaster } = {},
      // Slides cut by default.
      theme = createSlideTheme({ slideTransition: { duration: 150 } }),
    ) {
      const started = fakeScoped();
      render(
        <Deck theme={theme}>
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
      expect(started.map(({ kind }) => kind)).toEqual(['slide']);
    });

    it('lets either slide turn off the fade', async () => {
      const started = renderSlides({ cut: true });
      const user = userEvent.setup();
      // Into the slide, and out of it.
      await user.keyboard('{PageDown}');
      await started[0]?.capture();
      await started[0]?.end();
      await user.keyboard('{PageUp}');
      expect(durations(started)).toEqual(['0ms', '0ms']);
    });

    it('cuts fades into a slide', async () => {
      const started = renderSlides({ cut: 'in' });
      const user = userEvent.setup();
      await user.keyboard('{PageDown}');
      expect(durations(started)).toEqual(['0ms']);
      await started[0]?.capture();
      await started[0]?.end();
      // Going back leaves it.
      await user.keyboard('{PageUp}');
      expect(durations(started)).toEqual(['0ms', '150ms']);
    });

    it('cuts fades with the slide before it, both ways', async () => {
      const started = renderSlides({ cut: 'before' });
      const user = userEvent.setup();
      await user.keyboard('{PageDown}');
      await started[0]?.capture();
      await started[0]?.end();
      await user.keyboard('{PageUp}');
      expect(durations(started)).toEqual(['0ms', '0ms']);
    });

    it('keeps fades with the slide before it when cutting after it', async () => {
      const started = renderSlides({ cut: 'after out' });
      const user = userEvent.setup();
      await user.keyboard('{PageDown}');
      expect(durations(started)).toEqual(['150ms']);
    });

    it('lets the master of the slide turn off the fade', async () => {
      const Cut: SlideMaster = ({ children }) => <div>{children}</div>;
      Cut.cut = true;
      const started = renderSlides({ master: Cut });
      await userEvent.setup().keyboard('{PageDown}');
      expect(durations(started)).toEqual(['0ms']);
    });

    it('fades between slides for as long as one of them says, both ways', async () => {
      const started = renderSlides({ fade: 300 });
      const user = userEvent.setup();
      await user.keyboard('{PageDown}');
      await started[0]?.capture();
      await started[0]?.end();
      await user.keyboard('{PageUp}');
      expect(durations(started)).toEqual(['300ms', '300ms']);
    });

    it('takes the duration of fades from the master', async () => {
      const Instant: SlideMaster = ({ children }) => <div>{children}</div>;
      Instant.fade = 0;
      const started = renderSlides({ master: Instant });
      await userEvent.setup().keyboard('{PageDown}');
      expect(durations(started)).toEqual(['0ms']);
    });

    it('cuts slides without a duration', async () => {
      const theme = createSlideTheme({ slideTransition: { duration: 0 } });
      const started = renderSlides({}, theme);
      await userEvent.setup().keyboard('{PageDown}');
      expect(durations(started)).toEqual(['0ms']);
    });

    async function stepDurations(
      slide: ReactNode,
      keys: readonly string[] = ['{ArrowRight}'],
    ): Promise<string[]> {
      const started = fakeScoped();
      const user = userEvent.setup();
      render(<Deck>{slide}</Deck>);
      const durations: string[] = [];
      for (const key of keys) {
        const count = started.length;
        await user.keyboard(key);
        const duration =
          started.length === count ? 'none' : started.at(-1)?.duration;
        durations.push(duration === '0ms' ? 'cut' : String(duration));
        await started.at(-1)?.capture();
        await started.at(-1)?.end();
      }
      return durations;
    }

    it('fades steps for as long as the steps say', async () => {
      expect(
        await stepDurations(
          <Slide title="Steps">
            <Step fadeIn={300}>A</Step>
          </Slide>,
        ),
      ).toEqual(['300ms']);
    });

    it('prefers the fades of the sides of steps', async () => {
      expect(
        await stepDurations(
          <Slide title="Steps">
            <Step fade={300}>A</Step>
            <Step fadeBefore={100}>B</Step>
          </Slide>,
          ['{ArrowRight}', '{ArrowRight}', '{ArrowLeft}'],
        ),
      ).toEqual(['300ms', '100ms', '100ms']);
    });

    it('cuts steps', async () => {
      expect(
        await stepDurations(
          <Slide title="Steps">
            <Step cut>A</Step>
            <Step cut="in">B</Step>
            <Step>C</Step>
          </Slide>,
          ['{ArrowRight}', '{ArrowRight}', '{ArrowRight}'],
        ),
      ).toEqual(['cut', 'cut', '150ms']);
    });

    it('merges the fades of nested steps and groups', async () => {
      expect(
        await stepDurations(
          <Slide title="Steps">
            <Step fadeOut={400}>
              A<Step fadeOut={200}>B</Step>
            </Step>
            <Step group="c">C</Step>
            <Step group="c" fadeIn={300}>
              D
            </Step>
          </Slide>,
          ['{ArrowRight}', '{ArrowRight}', '{ArrowRight}'],
        ),
      ).toEqual(['150ms', '150ms', '400ms']);
    });

    it('cuts whatever other steps say, unlike fades of no time', async () => {
      expect(
        await stepDurations(
          <Slide title="Steps">
            <Step fadeOut={400}>A</Step>
            <Step fadeIn={0} fadeOut={400}>
              B
            </Step>
            <Step cut>C</Step>
          </Slide>,
          ['{ArrowRight}', '{ArrowRight}', '{ArrowRight}'],
        ),
      ).toEqual(['150ms', '400ms', 'cut']);
    });

    it('falls back to the fade of the slide', async () => {
      expect(
        await stepDurations(
          <Slide title="Steps" fade={400}>
            <Step>A</Step>
          </Slide>,
        ),
      ).toEqual(['400ms']);
    });

    describe('useStepTransition', () => {
      function Timing() {
        const { duration, forward } = useStepTransition();
        return (
          <output data-testid="timing">{`${String(duration)} ${forward ? 'forward' : 'back'}`}</output>
        );
      }

      function renderTiming() {
        render(
          <Deck>
            <Slide title="Steps">
              <Timing />
              <Step fade={300}>A</Step>
              <Step cut>B</Step>
            </Slide>
          </Deck>,
        );
        return () => screen.getByTestId('timing').textContent;
      }

      it('follows the fades of the steps', async () => {
        const started = fakeScoped();
        const timing = renderTiming();
        const user = userEvent.setup();
        expect(timing()).toBe('0 forward');
        await user.keyboard('{ArrowRight}');
        await started.at(-1)?.capture();
        expect(timing()).toBe('300 forward');
        await started.at(-1)?.end();
        // Cut.
        await user.keyboard('{ArrowRight}');
        await started.at(-1)?.capture();
        expect(timing()).toBe('0 forward');
        await started.at(-1)?.end();
        await user.keyboard('{ArrowLeft}');
        await started.at(-1)?.capture();
        expect(timing()).toBe('0 back');
      });

      it('tells when the views show the step', async () => {
        const started = fakeScoped();
        let release: () => void = () => undefined;
        function Shown() {
          const { shown } = useStepTransition();
          const store = use(StepStoreContext);
          const path = useSyncExternalStore(store.subscribe, store.getPath);
          const transitions = use(SlideTransitionsContext);
          // Holds the change to the first step until the test releases it.
          useLayoutEffect(() => {
            if (path.length > 0) release = transitions.hold(1000);
          }, [path, transitions]);
          return <output data-testid="shown">{String(shown)}</output>;
        }
        render(
          <Deck>
            <Slide title="Steps">
              <Shown />
              <Step>A</Step>
            </Slide>
          </Deck>,
        );
        const shown = () => screen.getByTestId('shown').textContent;
        expect(shown()).toBe('true');
        await userEvent.setup().keyboard('{ArrowRight}');
        const captured = started.at(-1)?.capture();
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 20));
        });
        expect(shown()).toBe('false');
        act(() => {
          release();
        });
        await act(async () => {
          await captured;
        });
        expect(shown()).toBe('true');
      });

      it('follows the fades of the steps where the slide cuts', async () => {
        // Without view transitions.
        const timing = renderTiming();
        await userEvent.setup().keyboard('{ArrowRight}');
        expect(timing()).toBe('300 forward');
      });
    });

    it('cuts with transitions of the whole document', async () => {
      const started = fakeTransitions(document);
      const user = userEvent.setup();
      render(
        <Deck>
          <Slide title="Steps">
            <Step fade={300}>A</Step>
          </Slide>
        </Deck>,
      );
      await user.keyboard('{ArrowRight}');
      expect(durations(started)).toEqual(['0ms']);
    });

    it('cuts steps without a duration', async () => {
      const theme = createSlideTheme({ stepTransition: { duration: 0 } });
      expect(durations(await stepWith(theme))).toEqual(['0ms']);
    });
  });
});
