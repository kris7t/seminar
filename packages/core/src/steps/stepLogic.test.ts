import type { Theme } from '@mui/material/styles';
import { afterEach, describe, expect, it } from 'vitest';

import { createSlideTheme } from '../theme/createSlideTheme.ts';
import {
  resolveElementAppearance,
  resolveStepOptions,
} from './resolveStepper.ts';
import {
  rankAppearances,
  rankOf,
  SHOWN,
  type RankedAppearance,
  type StepAppearances,
} from './stepAppearance.ts';
import { JOINS_CONTENT } from './stepDefaults.ts';
import { StepNode, type StepPath } from './StepNode.ts';
import type { StepBehavior } from './Step.tsx';
import { StepStore } from './StepStore.ts';
import type { SlideSplitProp } from './stepSplit.ts';
import type { StepRange } from './stepRange.ts';
import type { UseStepsOptions } from './useSteps.ts';

interface TestStep {
  name: string;
  element: HTMLElement;
  node: StepNode;
  props: UseStepsOptions;
  count: number;
  inside: TestStep | undefined;
}

/** A slide of steps with the logic of `Step`, without rendering anything. */
class TestSlide {
  readonly #store = new StepStore();
  readonly #steps: TestStep[] = [];
  readonly #theme: Theme;
  readonly #behavior: StepBehavior | undefined;

  constructor({
    steps,
    theme = createSlideTheme(),
    split,
    range,
  }: {
    steps?: string;
    theme?: Theme;
    split?: SlideSplitProp;
    range?: StepRange;
  } = {}) {
    this.#theme = theme;
    this.#behavior = steps as StepBehavior | undefined;
    this.#store.setSplit(
      split,
      rankOf(theme, theme.legibleStepAppearance ?? 'dimmed'),
    );
    this.#store.setRange(range);
  }

  /** Adds a step with the props of `Step`, inside the element of `inside`. */
  step(
    name: string,
    props: UseStepsOptions = {},
    inside?: TestStep,
    count = 1,
  ): TestStep {
    const element = document.createElement('div');
    element.append(name);
    (inside?.element ?? document.body).append(element);
    const group = props.group ?? props.id;
    const node =
      group === undefined ? new StepNode() : this.#store.getGroup(group);
    this.#store.attach(
      node,
      element,
      resolveStepOptions(count, this.#theme, this.#behavior, props),
    );
    const step = { name, element, node, props, count, inside };
    this.#steps.push(step);
    return step;
  }

  /** Adds content like a paragraph, list item, or image. */
  content(
    name: string,
    props: UseStepsOptions = {},
    inside?: TestStep,
  ): TestStep {
    return this.step(name, { defaults: JOINS_CONTENT, ...props }, inside);
  }

  /** Adds steps like `Steps`. */
  steps(name: string, count: number, props: UseStepsOptions = {}): TestStep {
    return this.step(
      name,
      { defaults: { behavior: 'always', split: 'each' }, ...props },
      undefined,
      count,
    );
  }

  next(times = 1): this {
    for (let index = 0; index < times; index += 1) {
      this.#store.next();
    }
    return this;
  }

  go(path: StepPath): this {
    this.#store.reset(path);
    return this;
  }

  /** The current step as in the address, like `1.2`. */
  get path(): string {
    return this.#store.getPath().join('.');
  }

  /** All paths of the slide in order. */
  get paths(): string[] {
    return this.#store.getStates().map((path) => path.join('.'));
  }

  /** The current phase of `step` and how it appears, like `past hidden`. */
  state(step: TestStep): string {
    return `${this.phase(step)} ${this.appearance(step).name}`;
  }

  phase(step: TestStep): string {
    return this.#store.getStatus(step.node).phase;
  }

  appearance(step: TestStep): RankedAppearance {
    const { phase, inherited, appearance } = this.#store.getStatus(step.node);
    const { appearances, defaultAppearances } = resolveStepOptions(
      step.count,
      this.#theme,
      this.#behavior,
      step.props,
    );
    return resolveElementAppearance(
      phase,
      appearances,
      appearance,
      // Every element of `Step` has them.
      defaultAppearances ?? this.#throw(step),
      inherited,
      step.inside === undefined ? SHOWN : this.appearance(step.inside),
    );
  }

  #throw(step: TestStep): never {
    throw new Error(`${step.name} has no appearances`);
  }

  /** The steps that have been shown, marking the current ones with `*`. */
  get shown(): string[] {
    return [...this.#steps]
      .sort((a, b) =>
        a.element.compareDocumentPosition(b.element) &
        Node.DOCUMENT_POSITION_FOLLOWING
          ? -1
          : 1,
      )
      .flatMap((step) => {
        const phase = this.phase(step);
        if (phase === 'future' || phase === 'distantFuture') {
          return [];
        }
        return [
          `${phase === 'current' || phase === 'open' ? '*' : ''}${step.name}`,
        ];
      });
  }

  /** The steps as `path label` lines, indented by level. */
  get tree(): string[] {
    const lines = (
      entries: ReturnType<StepStore['getTree']>,
      indent: string,
    ): string[] =>
      entries.flatMap(({ path, label, overlay, children }) => [
        `${indent}${path.join('.')} ${label}${overlay ? ' [overlay]' : ''}`,
        ...lines(children, `${indent}  `),
      ]);
    return lines(this.#store.getTree(), '');
  }

  /** The current step as links refer to it, by its group if it has one. */
  get address(): string {
    const { group, path } = this.#store.describePath(this.#store.getPath());
    return [...(group === undefined ? [] : [group]), ...path].join('.');
  }

  /** The steps that become pages, as paths. */
  get pages(): string[] {
    return this.#store.getSplitPaths().map((path) => path.join('.'));
  }
}

const ghostTheme = () =>
  createSlideTheme({
    stepBehaviors: {
      ghost: { future: 'dimmed', past: 'hidden' },
    } as Record<string, StepAppearances>,
  });

const ghost = { ghost: '' } as UseStepsOptions;

describe('the logic of steps', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  describe('placing', () => {
    it('shows steps together with the previous one', () => {
      const slide = new TestSlide();
      slide.step('a');
      slide.step('b', { with: 'previous' });
      slide.step('c');
      expect(slide.next().shown).toEqual(['*a', '*b']);
      expect(slide.next().shown).toEqual(['a', 'b', '*c']);
    });

    it('shows content with the previous step unless it is a step', () => {
      const slide = new TestSlide();
      slide.step('a');
      slide.content('b');
      slide.content('c', { only: true });
      slide.content('d', { step: true });
      slide.content('e', { id: 'e' });
      expect(slide.next().shown).toEqual(['*a', '*b']);
      // A behavior makes an item a step of its own.
      expect(slide.next().shown).toEqual(['a', 'b', '*c']);
      // So does `step`, and an id alone doesn't. The `only` item is past.
      expect(slide.next().shown).toEqual(['a', 'b', 'c', '*d', '*e']);
    });

    it('follows the content before overlays', () => {
      const slide = new TestSlide();
      slide.content('a', { step: true });
      slide.step('callout', { overlay: true });
      slide.content('b');
      expect(slide.shown).toEqual([]);
      expect(slide.next().shown).toEqual(['*a', '*b']);
      expect(slide.next().shown).toEqual(['a', '*callout', 'b']);
    });

    it('shows content up front if only overlays are before it', () => {
      const slide = new TestSlide();
      slide.step('callout', { overlay: true });
      slide.content('a');
      expect(slide.shown).toEqual(['*a']);
      expect(slide.next().shown).toEqual(['*callout', '*a']);
    });

    it('follows overlays that are ordinary steps', () => {
      const slide = new TestSlide();
      slide.step('callout', { overlay: false });
      slide.content('a');
      expect(slide.shown).toEqual([]);
      expect(slide.next().shown).toEqual(['*callout', '*a']);
    });

    it('follows steps shown up front', () => {
      const slide = new TestSlide();
      slide.content('a', { step: true });
      slide.step('up front', { with: 'initial' });
      slide.content('b');
      expect(slide.shown).toEqual(['*up front', '*b']);
      expect(slide.next().shown).toEqual(['*a', 'up front', 'b']);
    });

    it('creates step 0 if written and there is nothing to join', () => {
      const slide = new TestSlide();
      const a = slide.step('a', { with: 'content' });
      slide.step('more', {}, slide.content('p', {}, a));
      slide.step('callout', { overlay: true });
      slide.step('b', { with: 'content' });
      // The second one joins the first one, skipping the overlay.
      expect(slide.shown).toEqual(['*a', '*p', '*b']);
      expect(slide.next().path).toBe('0.1');
      expect(slide.shown).toEqual(['*a', '*p', '*more', '*b']);
    });

    it('keeps overlays shown with the previous step together', () => {
      const slide = new TestSlide();
      slide.content('a');
      slide.step('x', { overlay: true });
      slide.step('y', { overlay: true, with: 'previous' });
      slide.content('b');
      expect(slide.shown).toEqual(['*a', '*b']);
      expect(slide.next().shown).toEqual(['*a', '*x', '*y', '*b']);
    });

    it('joins an overlay with the previous step explicitly', () => {
      const slide = new TestSlide();
      slide.step('x', { overlay: true });
      slide.step('a', { with: 'previous' });
      expect(slide.shown).toEqual([]);
      expect(slide.next().shown).toEqual(['*x', '*a']);
    });

    it('nests steps in content in the step the content is part of', () => {
      const slide = new TestSlide();
      slide.content('a', { step: true });
      const b = slide.content('b');
      slide.content('p', {}, b);
      slide.content('more', { step: true }, b);
      slide.content('after');
      expect(slide.next().shown).toEqual(['*a', '*b', '*p', '*after']);
      expect(slide.next().path).toBe('1.1');
      expect(slide.shown).toEqual(['*a', '*b', '*p', '*more', '*after']);
    });

    it('numbers steps in content without a step as steps of the slide', () => {
      const slide = new TestSlide();
      slide.content(
        'deep',
        { step: true },
        slide.content('inner', {}, slide.content('outer')),
      );
      expect(slide.next().path).toBe('1');
    });

    it('shows content with the latest step on its level, wherever it is', () => {
      const slide = new TestSlide();
      slide.content('a');
      slide.content('b', { step: true });
      slide.content('c');
      expect(slide.shown).toEqual(['*a']);
      expect(slide.next().shown).toEqual(['*a', '*b', '*c']);
    });

    it('keeps steppers with several steps out of the step they join', () => {
      const slide = new TestSlide();
      slide.step('a');
      slide.step('several', { with: 'previous' }, undefined, 2);
      expect(slide.paths).toEqual(['', '1', '2']);
    });

    it('takes the defaults of a stepper like those of a step', () => {
      const slide = new TestSlide();
      slide.step('a');
      slide.content('joining');
      slide.step('b');
      expect(slide.paths).toEqual(['', '1', '2']);
      expect(slide.next(2).shown).toEqual(['a', 'joining', '*b']);
    });

    it('creates a step by default only with with, not joins', () => {
      const slide = new TestSlide();
      const joins = slide.step('joins', { defaults: { joins: 'content' } });
      slide.step('in joins', {}, joins);
      const withStep = slide.step('with', { defaults: { with: 'content' } });
      slide.step('in with', {}, withStep);
      // The first one is part of nothing, so the step inside it is a step of the
      // slide, which the second one joins.
      expect(slide.shown).toEqual(['*joins']);
      expect(slide.next().path).toBe('1');
      expect(slide.shown).toEqual(['*joins', '*in joins', '*with']);
      expect(slide.next().path).toBe('1.1');
      expect(slide.shown).toEqual(['*joins', '*in joins', '*with', '*in with']);
    });

    it.each([[false], ['false' as const]])(
      'treats step=%j like with="parent", unless with is set',
      (step) => {
        const slide = new TestSlide();
        slide.step('first', { with: 'initial' });
        slide.step('inside', {}, slide.step('not a step', { step }));
        slide.step('own', { step, with: 'self' });
        expect(slide.shown).toEqual(['*first', '*not a step']);
        expect(slide.next().path).toBe('1');
        expect(slide.next().path).toBe('2');
        expect(slide.shown).toContain('*own');
      },
    );

    it('places with="parent" with what encloses it', () => {
      const slide = new TestSlide();
      slide.step('first', { with: 'initial' });
      slide.content('stays', { with: 'parent' });
      slide.step('inside', {}, slide.content('too'));
      slide.step('next');
      expect(slide.shown).toEqual(['*first', '*stays', '*too']);
      // The step inside it is a step of the slide, not nested in the initial one.
      expect(slide.next().path).toBe('1');
      expect(slide.shown).toEqual(['first', '*stays', '*too', '*inside']);
    });

    it('shows content after Steps at their last step, unless an overlay', () => {
      const slide = new TestSlide();
      slide.step('a');
      slide.steps('overlay', 2, { overlay: true });
      const withA = slide.content('with a');
      slide.steps('figure', 2);
      const withFigure = slide.content('with figure');
      slide.next();
      expect(slide.state(withA)).toBe('current shown');
      slide.next(3);
      expect(slide.path).toBe('4');
      expect(slide.phase(withFigure)).toBe('future');
      expect(slide.next().path).toBe('5');
      expect(slide.phase(withFigure)).toBe('current');
    });

    it('shows a step with the step it joins, and what is nested after it', () => {
      const slide = new TestSlide();
      slide.step('a');
      slide.step('b');
      const c = slide.step('c', { with: 'previous' });
      slide.step('c.1', {}, c);
      expect(slide.next(2).shown).toEqual(['a', '*b', '*c']);
      expect(slide.path).toBe('2');
      expect(slide.next().shown).toEqual(['a', '*b', '*c', '*c.1']);
      expect(slide.path).toBe('2.1');
    });
  });

  describe('groups', () => {
    it('shares steps between the elements of a group', () => {
      const slide = new TestSlide();
      slide.step('a1', { group: 'a' });
      slide.step('b1', { group: 'b' });
      slide.step('a2', { group: 'a' });
      slide.step('b2', { group: 'b' });
      expect(slide.shown).toEqual([]);
      expect(slide.next().shown).toEqual(['*a1', '*a2']);
      expect(slide.next().shown).toEqual(['a1', '*b1', 'a2', '*b2']);
      // Steps of groups are referred to by the names of the groups.
      expect(slide.address).toBe('b');
    });

    it('nests a group wherever it is first found', () => {
      const slide = new TestSlide();
      const x = slide.step('x');
      const a1 = slide.step('a1', { group: 'a' }, x);
      slide.step('a1.1', {}, a1);
      slide.step('a2', { group: 'a' });
      expect(slide.next().shown).toEqual(['*x']);
      expect(slide.next().shown).toEqual(['*x', '*a1', '*a2']);
      expect(slide.address).toBe('a');
      expect(slide.next().shown).toEqual(['*x', '*a1', '*a1.1', '*a2']);
      expect(slide.address).toBe('a.1');
    });

    it('places the group by its first element', () => {
      const slide = new TestSlide();
      slide.step('x');
      slide.step('a1', { group: 'a', with: 'previous' });
      slide.step('a2', { group: 'a', with: 'initial' });
      expect(slide.shown).toEqual([]);
      expect(slide.next().shown).toEqual(['*x', '*a1', '*a2']);
    });

    it('follows a group where it is placed, not at its later elements', () => {
      const slide = new TestSlide();
      slide.step('a1', { group: 'a' });
      slide.step('b1', { group: 'b' });
      slide.step('a2', { group: 'a' });
      slide.content('p');
      expect(slide.next().shown).toEqual(['*a1', '*a2']);
      expect(slide.next().shown).toEqual(['a1', '*b1', 'a2', '*p']);
    });

    it('takes the appearance of the element creating the group', () => {
      const slide = new TestSlide({ steps: 'dim' });
      const a = slide.step('a', { group: 'g' });
      const b = slide.step('b', { group: 'g', only: true });
      const c = slide.step('c', { group: 'h', only: true });
      const d = slide.step('d', { group: 'h' });
      slide.step('e');
      slide.next(3);
      expect([a, b, c, d].map((step) => slide.appearance(step).name)).toEqual([
        'dimmed',
        'hidden',
        'hidden',
        'hidden',
      ]);
    });

    it('lets a default behavior apply to the element alone', () => {
      const slide = new TestSlide();
      const a = slide.step('a');
      const b = slide.step('b', { group: 'g' }, a);
      const c = slide.step(
        'c',
        { group: 'g', defaults: { behavior: 'scoped' } },
        a,
      );
      slide.step('d');
      slide.next(3);
      expect(slide.appearance(b).name).toBe('shown');
      expect(slide.appearance(c).name).toBe('hidden');
    });

    it('does not show elements up front like the steps creating it', () => {
      const slide = new TestSlide();
      slide.steps('a', 1, { group: 'g' });
      expect(slide.appearance(slide.step('b', { group: 'g' })).name).toBe(
        'hidden',
      );
    });
  });

  describe('with="initial"', () => {
    it('shows steps up front', () => {
      const slide = new TestSlide();
      slide.step('a', { with: 'initial' });
      slide.step('b', { with: 'previous' });
      slide.step('c');
      expect(slide.shown).toEqual(['*a', '*b']);
      expect(slide.next().shown).toEqual(['a', 'b', '*c']);
      expect(slide.path).toBe('1');
      expect(slide.go([]).shown).toEqual(['*a', '*b']);
    });

    it('is the same as with="previous" without previous steps', () => {
      const slide = new TestSlide();
      slide.step('a', { with: 'previous' });
      slide.step('b', { with: 'previous' });
      slide.step('c');
      const d = slide.step('d', { with: 'previous' });
      slide.step('d.a', { with: 'previous' }, d);
      slide.step('d.b', {}, d);
      expect(slide.shown).toEqual(['*a', '*b']);
      expect(slide.next().shown).toEqual(['a', 'b', '*c', '*d', '*d.a']);
      expect(slide.next().shown).toEqual(['a', 'b', '*c', '*d', 'd.a', '*d.b']);
    });

    it('steps through steps nested in steps shown up front', () => {
      const slide = new TestSlide();
      const a = slide.step('a', { with: 'initial' });
      slide.step('a.1', {}, a);
      slide.step('a.2', {}, a);
      slide.step('b');
      expect(slide.paths).toEqual(['', '0.1', '0.2', '1']);
      expect(slide.shown).toEqual(['*a']);
      expect(slide.next().shown).toEqual(['*a', '*a.1']);
      expect(slide.next().shown).toEqual(['*a', 'a.1', '*a.2']);
      expect(slide.next().shown).toEqual(['a', 'a.1', 'a.2', '*b']);
    });

    it('waits for the enclosing step', () => {
      const slide = new TestSlide();
      const one = slide.step('1');
      slide.step('1.a', { with: 'initial' }, one);
      slide.step('1.b', {}, one);
      expect(slide.shown).toEqual([]);
      expect(slide.next().shown).toEqual(['*1', '*1.a']);
      expect(slide.next().shown).toEqual(['*1', '1.a', '*1.b']);
      expect(slide.path).toBe('1.1');
    });

    it('takes initial as a shorthand', () => {
      const slide = new TestSlide();
      const one = slide.step('one', { swap: true, initial: true });
      const two = slide.step('two', { step: true, initial: true });
      const a = slide.step('a');
      const b = slide.step('b', { initial: false });
      expect(slide.appearance(one).name).toBe('shown');
      expect(slide.appearance(two).name).toBe('shown');
      expect(slide.appearance(a).name).toBe('hidden');
      expect(slide.next().path).toBe('1');
      expect(slide.appearance(one).name).toBe('collapsed');
      expect(slide.appearance(b).name).toBe('hidden');
    });

    it('joins an earlier initial step', () => {
      const slide = new TestSlide();
      slide.step('one', { swap: true, with: 'initial' });
      slide.step('a');
      const two = slide.step('two', { with: 'initial' });
      expect(slide.appearance(two).name).toBe('shown');
      expect(slide.next().appearance(two).name).toBe('collapsed');
    });

    it('creates step 0 if there is no initial step to join', () => {
      const slide = new TestSlide({ steps: 'dim' });
      const first = slide.step('first', { with: 'previous' });
      const inside = slide.step('inside', { scoped: true }, first);
      slide.step('next');
      expect(slide.next().path).toBe('0.1');
      expect(slide.appearance(inside).name).toBe('shown');
      expect(slide.appearance(first).name).toBe('shown');
      slide.next();
      expect(slide.appearance(inside).name).toBe('hidden');
      expect(slide.appearance(first).name).toBe('dimmed');
    });

    it('takes the default of the slide if it creates step 0', () => {
      const slide = new TestSlide({ steps: 'dim' });
      const written = slide.content('written', { with: 'content' });
      const plain = slide.content('plain');
      slide.step('next');
      slide.next();
      expect(slide.appearance(written).name).toBe('dimmed');
      expect(slide.appearance(plain).name).toBe('dimmed');
    });

    it('is open while steps nested in step 0 of it are shown', () => {
      const slide = new TestSlide();
      const outer = slide.step('outer');
      const inner = slide.step('inner', { with: 'initial' }, outer);
      slide.step('nested', {}, inner);
      slide.step('later', {}, outer);
      expect(slide.next(2).path).toBe('1.0.1');
      expect(slide.state(outer)).toBe('open shown');
      expect(slide.state(inner)).toBe('open shown');
      slide.next();
      expect(slide.state(outer)).toBe('open shown');
      expect(slide.state(inner)).toBe('past shown');
    });
  });

  describe('appearances', () => {
    /** A slide with a step with a nested step, and a step after it. */
    function nestedSlide(behavior?: StepBehavior, steps?: string) {
      const slide = new TestSlide(steps === undefined ? {} : { steps });
      const props = behavior === undefined ? {} : { behavior };
      const a = slide.step('A', props);
      return {
        slide,
        a,
        b: slide.step('B', props, a),
        c: slide.step('C', props),
      };
    }

    it('tells the phases apart', () => {
      const { slide, a, b, c } = nestedSlide();
      // Distant while the step it is nested in is still to come.
      expect([slide.state(a), slide.state(b), slide.state(c)]).toEqual([
        'future hidden',
        'distantFuture hidden',
        'future hidden',
      ]);
      slide.next();
      expect([slide.state(a), slide.state(b)]).toEqual([
        'current shown',
        'future hidden',
      ]);
      slide.next();
      expect([slide.state(a), slide.state(b)]).toEqual([
        'open shown',
        'current shown',
      ]);
      slide.next();
      expect([slide.state(a), slide.state(b), slide.state(c)]).toEqual([
        'past shown',
        'distantPast shown',
        'current shown',
      ]);
    });

    it.each([
      ['dim', 'hidden', 'dimmed'],
      ['preview', 'dimmed', 'shown'],
      ['focus', 'dimmed', 'dimmed'],
      ['only', 'hidden', 'hidden'],
      ['insert', 'collapsed', 'shown'],
      ['swap', 'collapsed', 'collapsed'],
      ['always', 'shown', 'shown'],
    ] as const)('appears as %s', (behavior, future, past) => {
      const { slide, a, c } = nestedSlide(behavior);
      expect(slide.state(c)).toBe(`future ${future}`);
      slide.next(3);
      expect(slide.state(a)).toBe(`past ${past}`);
      expect(slide.state(c)).toBe('current shown');
    });

    it('swaps steps in the same place', () => {
      const slide = new TestSlide();
      const steps = [
        slide.step('A', { with: 'initial', behavior: 'swap' }),
        slide.step('B', { behavior: 'swap' }),
        slide.step('C', { behavior: 'swap' }),
      ];
      const states = () => steps.map((step) => slide.state(step));
      expect(states()).toEqual([
        'current shown',
        'future collapsed',
        'future collapsed',
      ]);
      slide.next();
      expect(states()).toEqual([
        'past collapsed',
        'current shown',
        'future collapsed',
      ]);
      slide.next();
      expect(states()).toEqual([
        'past collapsed',
        'past collapsed',
        'current shown',
      ]);
    });

    it('takes the behavior from the slide', () => {
      const { slide, a } = nestedSlide(undefined, 'dim');
      expect(slide.next(3).state(a)).toBe('past dimmed');
    });

    it('prefers the slide to the default of the theme', () => {
      const slide = new TestSlide({
        steps: 'dim',
        theme: createSlideTheme({
          components: { SeminarStep: { defaultProps: { behavior: 'only' } } },
        }),
      });
      const a = slide.step('A');
      const b = slide.step('B', { behavior: 'reveal' });
      slide.step('C');
      slide.next(3);
      expect([slide.state(a), slide.state(b)]).toEqual([
        'past dimmed',
        'past shown',
      ]);
    });

    it('falls back to more general phases', () => {
      const ranked = rankAppearances(createSlideTheme(), {
        future: 'dimmed',
        current: 'hidden',
        distantPast: 'hidden',
      });
      expect(
        Object.fromEntries(
          Object.entries(ranked).map(([phase, { name }]) => [phase, name]),
        ),
      ).toEqual({
        distantFuture: 'dimmed',
        future: 'dimmed',
        current: 'hidden',
        open: 'hidden',
        past: 'shown',
        distantPast: 'hidden',
      });
    });

    it('takes the appearances of behaviors from the theme', () => {
      const slide = new TestSlide({
        theme: createSlideTheme({
          stepBehaviors: { dim: { future: 'dimmed', past: 'hidden' } },
        }),
      });
      const a = slide.step('A', { group: 'a', behavior: 'dim' });
      slide.step('B');
      const x = slide.step('X', { in: 'a' });
      expect(slide.state(a)).toBe('future dimmed');
      slide.next(3);
      // Hidden with A, which the theme hides after its turn.
      expect([slide.state(a), slide.state(x)]).toEqual([
        'past hidden',
        'distantPast hidden',
      ]);
    });

    it('ranks appearances added by the theme', () => {
      const slide = new TestSlide({
        theme: createSlideTheme({
          stepAppearances: { faded: 50 } as Record<string, number>,
          stepBehaviors: {
            dim: { future: 'hidden', past: 'faded' as 'dimmed' },
          },
        }),
      });
      const a = slide.step('A', { group: 'a', behavior: 'dim' });
      slide.step('B');
      const x = slide.step('X', { in: 'a' });
      const y = slide.step('Y', { in: 'a', behavior: 'focus' });
      slide.next(4);
      // Faded with A, since reveal would show it.
      expect(slide.appearance(a).name).toBe('faded');
      expect(slide.appearance(x).name).toBe('faded');
      // Dimmed is more hidden than faded.
      expect(slide.appearance(y).name).toBe('dimmed');
    });

    it('takes behaviors from shorthands', () => {
      const slide = new TestSlide({ theme: ghostTheme() });
      const a = slide.step('A', { only: true });
      const b = slide.step('B', ghost);
      const c = slide.step('C', { only: true, behavior: 'preview' });
      const d = slide.step('D', { only: false });
      expect([slide.state(b), slide.state(c)]).toEqual([
        'future dimmed',
        'future dimmed',
      ]);
      slide.next(4);
      expect([slide.state(a), slide.state(b), slide.state(d)]).toEqual([
        'past hidden',
        'past hidden',
        'current shown',
      ]);
    });

    it('lets wrappers set a default while keeping custom shorthands', () => {
      const slide = new TestSlide({ steps: 'preview', theme: ghostTheme() });
      const defaults = { behavior: 'only' } as const;
      const a = slide.step('A', { defaults });
      const b = slide.step('B', { defaults, ...ghost });
      const c = slide.step('C', { defaults, behavior: 'dim' });
      expect([slide.state(a), slide.state(b), slide.state(c)]).toEqual([
        'future hidden',
        'future dimmed',
        'future hidden',
      ]);
      slide.next(3);
      expect([slide.state(a), slide.state(b)]).toEqual([
        'past hidden',
        'past hidden',
      ]);
    });
  });

  describe('appearances of content', () => {
    it('looks like the step it is part of', () => {
      const slide = new TestSlide();
      slide.step('A', { swap: true });
      const content = slide.content('with A');
      slide.step('B');
      expect(slide.appearance(content).name).toBe('collapsed');
      expect(slide.next().appearance(content).name).toBe('shown');
      expect(slide.next().appearance(content).name).toBe('collapsed');
    });

    it('takes the latest step of those shown together', () => {
      const slide = new TestSlide();
      const a = slide.step('A', { swap: true });
      const b = slide.step('B', { dim: true, with: 'previous' });
      const c = slide.content('C');
      slide.step('D');
      slide.next(2);
      expect(slide.appearance(a).name).toBe('collapsed');
      expect(slide.appearance(b).name).toBe('dimmed');
      expect(slide.appearance(c).name).toBe('dimmed');
    });

    it('ignores the behavior of the slide without a step', () => {
      const slide = new TestSlide({ steps: 'dim' });
      const intro = slide.content('intro');
      const a = slide.step('A');
      const detail = slide.content('detail', {}, a);
      slide.step('A1', {}, a);
      const withA = slide.content('with A');
      slide.step('B');
      expect(slide.next(2).path).toBe('1.1');
      expect(slide.appearance(intro).name).toBe('shown');
      expect(slide.appearance(detail).name).toBe('shown');
      slide.next();
      expect(slide.appearance(intro).name).toBe('shown');
      expect(slide.appearance(detail).name).toBe('dimmed');
      expect(slide.appearance(withA).name).toBe('dimmed');
    });

    it('becomes a new step if it names a behavior', () => {
      const slide = new TestSlide();
      const a = slide.content('A', { only: true });
      const b = slide.content('B', { only: true });
      expect(slide.appearance(a).name).toBe('hidden');
      expect(slide.next().path).toBe('1');
      expect(slide.appearance(a).name).toBe('shown');
      expect(slide.appearance(b).name).toBe('hidden');
      expect(slide.next().path).toBe('2');
      expect(slide.appearance(a).name).toBe('hidden');
      expect(slide.appearance(b).name).toBe('shown');
    });

    it('keeps the place of a default with if it names a behavior', () => {
      const slide = new TestSlide();
      const a = slide.step('A');
      const b = slide.step('B', { defaults: { with: 'content' }, only: true });
      slide.step('C');
      expect(slide.next().appearance(b).name).toBe('shown');
      expect(slide.next().path).toBe('2');
      expect(slide.appearance(b).name).toBe('hidden');
      expect(slide.appearance(a).name).toBe('shown');
    });

    it('looks like what encloses it, whatever behavior it has', () => {
      const slide = new TestSlide();
      const a = slide.step('A');
      const b = slide.step('B', {}, a);
      const written = slide.step('written', { with: 'parent', only: true }, b);
      const fallback = slide.step(
        'default',
        { step: false, defaults: { behavior: 'scoped' } },
        b,
      );
      slide.step('C', {}, a);
      slide.step('D');
      slide.next(3);
      expect(slide.state(written)).toBe('past shown');
      expect(slide.state(fallback)).toBe('past shown');
      slide.next();
      expect(slide.state(written)).toBe('distantPast shown');
      expect(slide.state(fallback)).toBe('distantPast shown');
    });

    it('keeps the behavior of elements of a group with="parent"', () => {
      const slide = new TestSlide();
      const a = slide.step('A');
      slide.step('B', { group: 'g', with: 'parent' }, a);
      const c = slide.step('C', { group: 'g' }, a);
      const d = slide.step('D', { group: 'g', only: true }, a);
      slide.step('E');
      slide.next();
      expect(slide.state(c)).toBe('current shown');
      expect(slide.state(d)).toBe('current shown');
      slide.next();
      expect(slide.state(c)).toBe('past shown');
      expect(slide.state(d)).toBe('past hidden');
    });

    it('joins the step it is placed with', () => {
      const slide = new TestSlide();
      slide.step('A', { swap: true });
      const joined = slide.step('joined', { with: 'previous' });
      const own = slide.step('own', { reveal: true, with: 'previous' });
      slide.step('B');
      slide.next(2);
      expect(slide.appearance(joined).name).toBe('collapsed');
      expect(slide.appearance(own).name).toBe('shown');
    });

    it('takes the default of the slide if what it joins has no appearances', () => {
      const slide = new TestSlide({ steps: 'dim' });
      const figure = slide.steps('figure', 2);
      const after = slide.content('after');
      slide.step('end');
      expect(slide.next().appearance(after).name).toBe('hidden');
      expect(slide.next().appearance(after).name).toBe('shown');
      expect(slide.next().appearance(after).name).toBe('dimmed');
      expect(slide.appearance(figure).name).toBe('shown');
    });

    it('stays in the step it joins with what it configures', () => {
      const slide = new TestSlide();
      const steps = [
        slide.step('A'),
        slide.content('B', { split: 'none' }),
        slide.content('C', { overlay: true }),
        slide.content('D', { fade: 400 }),
        slide.content('E'),
      ];
      expect(slide.paths).toEqual(['', '1']);
      slide.next();
      for (const step of steps) {
        expect(slide.appearance(step).name).toBe('shown');
      }
    });
  });

  describe('nesting with in', () => {
    /** A step with two steps nested in it with `in`, and a step after it. */
    function calloutSlide(parent: StepBehavior, callout: StepBehavior) {
      const slide = new TestSlide();
      const a = slide.step('A', { group: 'a', behavior: parent });
      const b = slide.step('B', { group: 'b' });
      const x = slide.step('X', { in: 'a', behavior: callout });
      const y = slide.step('Y', { in: 'a', behavior: callout });
      return { slide, a, b, x, y };
    }

    it('places the steps after the step they are nested in', () => {
      const { slide, a, b, x, y } = calloutSlide('reveal', 'reveal');
      const states = () => [a, x, y, b].map((step) => slide.state(step));
      slide.next();
      expect(states()).toEqual([
        'current shown',
        'future hidden',
        'future hidden',
        'future hidden',
      ]);
      slide.next();
      expect(states()).toEqual([
        'open shown',
        'current shown',
        'future hidden',
        'future hidden',
      ]);
      slide.next(2);
      // Distant once the step they are nested in is past.
      expect(states()).toEqual([
        'past shown',
        'distantPast shown',
        'distantPast shown',
        'current shown',
      ]);
    });

    it('tells the distant phases apart', () => {
      const slide = new TestSlide({
        theme: createSlideTheme({
          stepBehaviors: {
            callout: { future: 'hidden', distantPast: 'hidden' },
          } as Record<string, StepAppearances>,
        }),
      });
      const a = slide.step('A', { group: 'a', behavior: 'dim' });
      slide.step('B', { group: 'b' });
      const x = slide.step('X', {
        in: 'a',
        behavior: 'callout' as StepBehavior,
      });
      expect(slide.state(x)).toBe('distantFuture hidden');
      slide.next(2);
      expect([slide.state(a), slide.state(x)]).toEqual([
        'open shown',
        'current shown',
      ]);
      // Hidden once A is past, although A is only dimmed.
      slide.next();
      expect([slide.state(a), slide.state(x)]).toEqual([
        'past dimmed',
        'distantPast hidden',
      ]);
    });

    it('hides scoped steps once the step they are nested in is past', () => {
      const { slide, x, y } = calloutSlide('reveal', 'scoped');
      const states = () => [x, y].map((step) => slide.state(step));
      expect(states()).toEqual([
        'distantFuture hidden',
        'distantFuture hidden',
      ]);
      slide.next(3);
      expect(states()).toEqual(['past shown', 'current shown']);
      slide.next();
      expect(states()).toEqual(['distantPast hidden', 'distantPast hidden']);
    });

    it('looks at least as hidden as the step it is nested in', () => {
      const { slide, a, x, y } = calloutSlide('only', 'focus');
      // Hidden with the future parent, although focus would only dim it.
      expect(slide.state(x)).toBe('distantFuture hidden');
      slide.next();
      expect([slide.state(x), slide.state(y)]).toEqual([
        'future dimmed',
        'future dimmed',
      ]);
      slide.next();
      expect([slide.state(x), slide.state(y)]).toEqual([
        'current shown',
        'future dimmed',
      ]);
      slide.next();
      expect([slide.state(x), slide.state(y)]).toEqual([
        'past dimmed',
        'current shown',
      ]);
      // Hidden with the parent once it's past.
      slide.next();
      expect([slide.state(a), slide.state(x), slide.state(y)]).toEqual([
        'past hidden',
        'distantPast hidden',
        'distantPast hidden',
      ]);
    });

    it('collapses expanded steps once the step they are nested in is past', () => {
      const { slide, x, y } = calloutSlide('reveal', 'expand');
      const states = () => [x, y].map((step) => slide.state(step));
      expect(states()).toEqual([
        'distantFuture collapsed',
        'distantFuture collapsed',
      ]);
      slide.next(3);
      expect(states()).toEqual(['past shown', 'current shown']);
      slide.next();
      expect(states()).toEqual([
        'distantPast collapsed',
        'distantPast collapsed',
      ]);
    });

    it('collapses steps nested in collapsed steps', () => {
      const { slide, a, x, y } = calloutSlide('swap', 'reveal');
      expect(slide.state(x)).toBe('distantFuture collapsed');
      slide.next(2);
      expect([slide.state(a), slide.state(x)]).toEqual([
        'open shown',
        'current shown',
      ]);
      // Collapsed with the parent once it's past, rather than only hidden.
      slide.next(2);
      expect([slide.state(a), slide.state(x), slide.state(y)]).toEqual([
        'past collapsed',
        'distantPast collapsed',
        'distantPast collapsed',
      ]);
    });

    it('keeps hiding nested steps after their turn', () => {
      const { slide, a, x } = calloutSlide('reveal', 'only');
      slide.next(4);
      expect([slide.state(a), slide.state(x)]).toEqual([
        'past shown',
        'distantPast hidden',
      ]);
    });

    it('combines the DOM and in', () => {
      const slide = new TestSlide();
      const a = slide.step('A', { group: 'a', behavior: 'only' });
      const b = slide.step('B', { behavior: 'preview' });
      const x = slide.step('X', { in: 'a' }, b);
      slide.next(2);
      // Dimmed with B, which comes later and previews its content.
      expect(slide.state(x)).toBe('current dimmed');
      // Hidden with A once it's past, although B shows it.
      slide.next();
      expect([
        slide.state(a),
        slide.appearance(b).name,
        slide.state(x),
      ]).toEqual(['past hidden', 'shown', 'distantPast hidden']);
    });
  });

  describe('splitting into pages', () => {
    it('makes a single page of steps that stay shown', () => {
      const slide = new TestSlide();
      slide.step('A');
      slide.step('B', { dim: true });
      slide.step('C');
      expect(slide.pages).toEqual(['3']);
    });

    it('makes a page before steps are hidden or collapsed', () => {
      const slide = new TestSlide();
      slide.step('A', { only: true });
      slide.step('B', { swap: true, with: 'initial' });
      slide.step('C', { swap: true });
      slide.step('D');
      expect(slide.pages).toEqual(['', '1', '2', '3']);
    });

    it('makes a page of nested steps before their step is past', () => {
      const slide = new TestSlide();
      const a = slide.step('A');
      slide.step('A.1', { expand: true }, a);
      slide.step('A.2', { expand: true }, a);
      slide.step('B');
      expect(slide.pages).toEqual(['1.2', '2']);
    });

    it('counts dimmed content as shown, unless the theme says otherwise', () => {
      const pagesWith = (theme: Theme) => {
        const slide = new TestSlide({ theme });
        slide.step('A', { focus: true });
        slide.step('B');
        return slide.pages;
      };
      expect(pagesWith(createSlideTheme())).toEqual(['2']);
      expect(
        pagesWith(createSlideTheme({ legibleStepAppearance: 'shown' })),
      ).toEqual(['1', '2']);
    });

    it('leaves out steps that need no page', () => {
      const slide = new TestSlide();
      slide.step('A');
      slide.step('joke', { only: true, split: 'none' });
      slide.step('B');
      expect(slide.pages).toEqual(['3']);
    });

    it.each([
      ['before', ['1', '3']],
      // A bare `split` makes a page of the step when it's shown.
      ['', ['2', '3']],
      ['last none', ['2.2', '3']],
    ])('makes pages for split=%j', (split, pages) => {
      const slide = new TestSlide();
      slide.step('A');
      const b = slide.step('B', { split: split as 'before' });
      slide.step('B.1', {}, b);
      slide.step('B.2', {}, b);
      slide.step('C');
      expect(slide.pages).toEqual(pages);
    });

    it('passes the mode on to nested steps, which can change it', () => {
      const slide = new TestSlide();
      const a = slide.step('A', { split: 'none' });
      slide.step('A.1', { only: true }, a);
      slide.step('A.2', { only: true, split: 'auto' }, a);
      slide.step('A.3', { only: true }, a);
      expect(slide.pages).toEqual(['1.2', '1.3']);
    });

    it.each([
      ['none', ['3']],
      ['0, parse', ['', '2', '3']],
    ])('takes split=%j from the slide', (split, pages) => {
      const slide = new TestSlide({ split });
      slide.step('A', { only: true });
      slide.step('B', { only: true, group: 'parse' });
      slide.step('C', { only: true });
      expect(slide.pages).toEqual(pages);
    });

    it('makes a page of each step of `Steps`, unless they need none', () => {
      const each = new TestSlide();
      each.steps('figure', 2);
      expect(each.pages).toEqual(['', '1', '2']);
      const none = new TestSlide();
      none.steps('figure', 2, { split: 'none' });
      expect(none.pages).toEqual(['2']);
    });

    it('makes a page without overlays of the content they may cover', () => {
      const slide = new TestSlide();
      slide.step('figure');
      slide.step('first', { overlay: true });
      slide.step('second', { overlay: '' });
      slide.step('text');
      expect(slide.pages).toEqual(['1', '4']);
      expect(slide.tree).toEqual([
        '1 figure',
        '2 first [overlay]',
        '3 second [overlay]',
        '4 text',
      ]);
    });

    it('makes no page without overlays if content is only shown with them', () => {
      const slide = new TestSlide();
      slide.step('note', { overlay: true });
      slide.step('text');
      expect(slide.pages).toEqual(['', '2']);
    });

    it('makes no page without overlays of content shown along with them', () => {
      const slide = new TestSlide();
      const text = slide.step('text', { only: true });
      slide.step('note', { only: true, with: 'initial', overlay: true }, text);
      slide.step('more', { split: 'none' }, text);
      slide.step('end');
      expect(slide.pages).toEqual(['', '1', '2']);
    });

    it('makes pages of elements of a group with their own appearances', () => {
      const slide = new TestSlide();
      slide.step('A', { group: 'a' });
      slide.step('B', { only: true, group: 'a' });
      slide.step('end');
      expect(slide.pages).toEqual(['1', '2']);
    });

    it('only makes pages of steps in the range of the slide', () => {
      const slide = new TestSlide({ range: { from: '2' } });
      slide.step('A', { only: true });
      slide.step('B', { only: true });
      slide.step('C', { only: true });
      expect(slide.pages).toEqual(['2', '3']);
    });

    it('asks for pages in the turn of what encloses content without a step', () => {
      const slide = new TestSlide();
      slide.step('up front', { step: false, split: 'last' });
      slide.step('A');
      slide.step('B');
      expect(slide.pages).toEqual(['2']);
    });

    it('does not treat content without a step as covering what encloses it', () => {
      const slide = new TestSlide();
      slide.step('inert', { step: false, overlay: true }, slide.step('A'));
      slide.step('B');
      expect(slide.pages).toEqual(['2']);
    });

    describe('of what is shown together', () => {
      it('makes no page if only other steps have a say against one', () => {
        const slide = new TestSlide();
        slide.step('A', { only: true, split: 'none' });
        slide.content('B');
        slide.step('C', { only: true, with: 'previous' });
        slide.step('D');
        expect(slide.pages).toEqual(['2']);
      });

      it('makes a page if any step asks for it', () => {
        const slide = new TestSlide();
        slide.step('A', { only: true, split: 'none' });
        slide.step('B', { only: true, with: 'previous', split: 'auto' });
        slide.step('C');
        expect(slide.pages).toEqual(['1', '2']);
      });

      it('keeps the page of a step if what joins it needs none', () => {
        const slide = new TestSlide();
        slide.step('A', { only: true });
        slide.content('B', { split: 'none' });
        slide.step('C');
        expect(slide.pages).toEqual(['1', '2']);
      });

      it('takes the mode of the slide for the step they are shown with', () => {
        const slide = new TestSlide({ split: 'none' });
        slide.step('A', { only: true });
        slide.content('B');
        slide.step('C');
        expect(slide.pages).toEqual(['2']);
      });
    });
  });
});
