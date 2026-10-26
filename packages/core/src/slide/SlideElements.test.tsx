import { cleanup, render, screen } from '@testing-library/react';
import { useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Deck } from '../deck/Deck.tsx';
import { Step, stepClasses } from '../steps/Step.tsx';
import { Slide } from './Slide.tsx';
import { SlideMirror } from '../view/SlideMirror.tsx';
import {
  SlideElement,
  useSlideElement,
  useSlideElementId,
  useSlideElementRegistry,
} from './SlideElements.tsx';

/** Shows the id of the element called `name` in the same rendering. */
function Finder({ name }: { name: string }) {
  const element = useSlideElement(name);
  return <output data-testid="found">{element?.id ?? 'none'}</output>;
}

/**
 * Names an element that it doesn't render itself, like the parts of a figure,
 * marked with the id of the rendering.
 */
function Figure({ name }: { name: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const renderingId = useId();
  const register = useSlideElementRegistry();
  useLayoutEffect(() => {
    const part = ref.current?.querySelector('b');
    return part === null || part === undefined
      ? undefined
      : register(name, part);
  }, [register, name]);
  return (
    <>
      <span
        ref={ref}
        // eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml
        dangerouslySetInnerHTML={{ __html: `<b title="${renderingId}"></b>` }}
      />
      <i data-testid="rendering">{renderingId}</i>
    </>
  );
}

/** Shows the mark of the element called `name` in the same rendering. */
function MarkOf({ name }: { name: string }) {
  const element = useSlideElement(name);
  return (
    <output data-testid="mark">
      {element?.getAttribute('title') ?? 'none'}
    </output>
  );
}

function IdOf({ name }: { name: string }) {
  return <data>{useSlideElementId(name)}</data>;
}

function renderMirrors(slide: ReactNode) {
  return render(
    <Deck>
      <div>
        <SlideMirror index={0} slide={slide} kind="audience" />
        <SlideMirror index={1} slide={slide} kind="preview" />
      </div>
    </Deck>,
  );
}

describe('SlideElement', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '#');
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('gives every rendering of a slide ids of its own', () => {
    renderMirrors(
      <Slide id="first" title="First">
        <SlideElement as="span" name="target" data-testid="target">
          Target
        </SlideElement>
        <Finder name="target" />
      </Slide>,
    );
    const targets = screen.getAllByTestId('target');
    expect(targets.length).toBeGreaterThanOrEqual(2);
    const ids = targets.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^seminar-[\w-]+-target$/);
    }
    // Each rendering finds its own element.
    expect(
      screen.getAllByTestId('found').map(({ textContent }) => textContent),
    ).toEqual(ids);
  });

  it('names elements that components register in each rendering', () => {
    renderMirrors(
      <Slide id="first" title="First">
        <Figure name="figure.part" />
        <MarkOf name="figure.part" />
      </Slide>,
    );
    const renderings = screen
      .getAllByTestId('rendering')
      .map(({ textContent }) => textContent);
    expect(new Set(renderings).size).toBeGreaterThanOrEqual(2);
    expect(
      screen.getAllByTestId('mark').map(({ textContent }) => textContent),
    ).toEqual(renderings);
  });

  it('keeps names outside of slides', () => {
    render(<IdOf name="plain" />);
    expect(screen.getByText('plain')).toBeDefined();
  });

  it('warns about several elements with the same name', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    render(
      <Deck>
        <Slide>
          <SlideElement as="span" name="twice" />
          <SlideElement as="span" name="twice" />
        </Slide>
      </Deck>,
    );
    expect(warn).toHaveBeenCalledWith(
      'There are several elements called `twice` on a slide.',
    );
  });

  it('names the elements of steps, which form groups', async () => {
    const user = userEvent.setup();
    render(
      <Deck>
        <Slide>
          <Step id="parse" data-testid="parse">
            Parse
          </Step>
          <Step group="parse" data-testid="joined">
            Joined
          </Step>
          <Finder name="parse" />
        </Slide>
      </Deck>,
    );
    const parse = screen.getByTestId('parse');
    expect(parse.id).toMatch(/^seminar-[\w-]+-parse$/);
    expect(screen.getByTestId('found').textContent).toBe(parse.id);
    await user.keyboard('{ArrowRight}');
    expect(window.location.hash).toBe('#slide=1&step=parse');
    expect(
      screen.getByTestId('joined').classList.contains(stepClasses.current),
    ).toBe(true);
  });

  it('nests steps in the step of an element', async () => {
    const user = userEvent.setup();
    function Pointer() {
      return (
        <Step in={useSlideElement('figure')} data-testid="pointer">
          Pointer
        </Step>
      );
    }
    // The element is in a step of a component, rendered after the pointer.
    function Figure() {
      return (
        <Step data-testid="figure">
          <SlideElement as="span" name="figure">
            Figure
          </SlideElement>
        </Step>
      );
    }
    render(
      <Deck>
        <Slide>
          <Pointer />
          <Figure />
        </Slide>
      </Deck>,
    );
    const isCurrent = (testId: string) =>
      screen.getByTestId(testId).classList.contains(stepClasses.current);
    await user.keyboard('{ArrowRight}');
    expect(window.location.hash).toBe('#slide=1&step=1');
    expect(isCurrent('figure')).toBe(true);
    await user.keyboard('{ArrowRight}');
    expect(window.location.hash).toBe('#slide=1&step=1.1');
    expect(isCurrent('pointer')).toBe(true);
  });

  it('nests steps in their default only if they are not placed', async () => {
    const user = userEvent.setup();
    render(
      <Deck>
        <Slide>
          <Step data-testid="default" defaultAttachment={{ in: 'figure' }}>
            Default
          </Step>
          <Step
            id="named"
            data-testid="named"
            defaultAttachment={{ in: 'figure' }}
          >
            Named
          </Step>
          <Step
            data-testid="self"
            with="self"
            defaultAttachment={{ in: 'figure' }}
          >
            Next
          </Step>
          <Step group="figure">Figure</Step>
          <Step
            data-testid="joined"
            group="figure"
            defaultAttachment={{ in: 'other' }}
          >
            Joined
          </Step>
        </Slide>
      </Deck>,
    );
    const isCurrent = (testId: string) =>
      screen.getByTestId(testId).classList.contains(stepClasses.current);
    await user.keyboard('{ArrowRight}');
    // The step with `with="self"` comes first, where it is.
    expect(isCurrent('self')).toBe(true);
    await user.keyboard('{ArrowRight}');
    expect(window.location.hash).toBe('#slide=1&step=figure');
    // Joining a group places the step in the group.
    expect(isCurrent('joined')).toBe(true);
    await user.keyboard('{ArrowRight}');
    // Steps with only an id are still nested in their default.
    expect(window.location.hash).toBe('#slide=1&step=figure.1');
    expect(isCurrent('default')).toBe(true);
    await user.keyboard('{ArrowRight}');
    expect(window.location.hash).toBe('#slide=1&step=named');
    expect(isCurrent('named')).toBe(true);
  });

  it('nests steps creating a group in their default', async () => {
    const user = userEvent.setup();
    render(
      <Deck>
        <Slide>
          <Step
            data-testid="fresh"
            group="fresh"
            defaultAttachment={{ in: 'figure' }}
          >
            Fresh
          </Step>
          <Step group="figure">Figure</Step>
        </Slide>
      </Deck>,
    );
    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(window.location.hash).toBe('#slide=1&step=fresh');
    expect(
      screen.getByTestId('fresh').classList.contains(stepClasses.current),
    ).toBe(true);
    // The group is nested in the figure.
    await user.keyboard('{ArrowLeft}');
    expect(window.location.hash).toBe('#slide=1&step=figure');
  });

  it('refers to the elements of the same rendering', () => {
    renderMirrors(
      <Slide id="boxes">
        <svg>
          <SlideElement as="linearGradient" name="fade" />
          <SlideElement
            as="rect"
            data-testid="rect"
            references={{ fill: ['url(#', ['fade'], ')'] }}
          />
        </svg>
      </Slide>,
    );
    const rects = screen.getAllByTestId('rect');
    expect(rects.length).toBeGreaterThanOrEqual(2);
    for (const rect of rects) {
      const id = /^url\(#(.+)\)$/.exec(rect.getAttribute('fill') ?? '')?.[1];
      // The gradient of the same rendering, which is in the same SVG.
      expect(id).toBeDefined();
      expect(
        rect.closest('svg')?.querySelector(`#${CSS.escape(id ?? '')}`),
      ).not.toBeNull();
    }
    expect(new Set(rects.map((rect) => rect.getAttribute('fill'))).size).toBe(
      rects.length,
    );
  });

  it('refers to the elements of the same rendering in styles', () => {
    render(
      <Deck>
        <Slide>
          <svg>
            <SlideElement as="linearGradient" name="fade" data-testid="fade" />
            <SlideElement
              as="rect"
              data-testid="rect"
              styleNames={['fade']}
              style={{ fill: 'url("#fade")', stroke: 'url(#other)' }}
            />
          </svg>
        </Slide>
      </Deck>,
    );
    const rect = screen.getByTestId('rect');
    expect(rect.style.fill).toBe(`url("#${screen.getByTestId('fade').id}")`);
    expect(rect.style.stroke).toBe('url("#other")');
  });
});
