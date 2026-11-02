import { describe, expect, it } from 'vitest';

import {
  contentsHtml,
  sidebarHtml,
  stepsHtml,
  welcomeHtml,
  type ContentsEntry,
  type StepEntry,
} from './sidebarPage.ts';

function entry(
  slideIndex: number,
  title: string,
  other: Partial<ContentsEntry> = {},
): ContentsEntry {
  return {
    title,
    slideIndex,
    hasSlide: true,
    spare: false,
    steps: false,
    state: false,
    stateChanged: false,
    children: [],
    ...other,
  };
}

function step(path: number[], other: Partial<StepEntry> = {}): StepEntry {
  return {
    path,
    label: '',
    overlay: false,
    page: false,
    skipped: false,
    phase: 'past',
    children: [],
    ...other,
  };
}

/** Returns the rows of `html`, each as what it shows. */
function rows(html: string): string[] {
  return html.split('<div class="row').slice(1);
}

const steps = (entries: StepEntry[], current: number[] = []) =>
  stepsHtml({
    slideIndex: 0,
    current,
    startPhase: 'current',
    startPage: false,
    entries,
    sources: [],
  });

describe('contentsHtml', () => {
  it('highlights the current entry only, and makes the first level bold', () => {
    const [first, nested] = rows(
      contentsHtml({
        current: 1,
        entries: [entry(0, 'First', { children: [entry(1, 'Nested')] })],
      }),
    );
    expect(first).toContain('label open');
    expect(first).not.toContain('aria-current');
    expect(nested).toContain('aria-current="page"');
    expect(nested).not.toContain('label open');
    expect(nested).toContain('--level:1');
  });

  it('does not highlight entries without a slide of their own', () => {
    expect(
      contentsHtml({
        current: 0,
        entries: [entry(0, 'Division', { hasSlide: false })],
      }),
    ).not.toContain('aria-current');
  });

  it('names entries without a title after their slides, and escapes titles', () => {
    expect(
      contentsHtml({ entries: [entry(2, ''), entry(3, '<a> & "b"')] }),
    ).toContain('Slide 3');
    expect(contentsHtml({ entries: [entry(3, '<a>')] })).toContain('&lt;a&gt;');
  });

  it('marks spare slides, and goes to recaps and steps', () => {
    const html = contentsHtml({
      entries: [
        entry(0, 'Spare', { spare: true, steps: true, firstRecap: 4 }),
        entry(4, 'Recap', { recapOf: 0 }),
      ],
    });
    expect(html).toContain('Spare slide');
    expect(html).toContain('label open future');
    expect(html).toContain(
      `{&quot;type&quot;:&quot;goToSlide&quot;,&quot;slideIndex&quot;:4}`,
    );
    expect(html).toContain('showSteps');
    expect(html).toContain('Go to recapped slide');
    expect(html).toContain('Go to first recap');
  });

  it('only offers to reset slides whose state changed', () => {
    expect(
      contentsHtml({ entries: [entry(0, 'A', { state: true })] }),
    ).toContain('Keeps your changes');
    expect(
      contentsHtml({
        entries: [entry(0, 'A', { state: true, stateChanged: true })],
      }),
    ).toContain('class="mark changed"');
  });

  it('says if there is no table of contents', () => {
    expect(contentsHtml({ entries: [] })).toContain('no table of contents');
  });
});

describe('stepsHtml', () => {
  it('says if the slide has no steps', () => {
    expect(steps([])).toContain('no steps');
  });

  it('starts with the beginning of the slide', () => {
    const [start, one] = rows(steps([step([1], { label: 'One' })]));
    expect(start).toContain('Start of the slide');
    expect(start).toContain('aria-current="step"');
    expect(one).toContain('One');
  });

  it('merges step 0 of the slide into its beginning', () => {
    const [start, nested, one] = rows(
      steps([
        step([0], {
          label: 'Always',
          children: [step([0, 1], { label: 'Nested' })],
        }),
        step([1], { label: 'One' }),
      ]),
    );
    expect(start).toContain('Always');
    expect(nested).toContain('--level:1');
    expect(one).toContain('--level:0');
  });

  it('styles steps by where they are', () => {
    const html = (other: Partial<StepEntry>) =>
      rows(steps([step([1], { label: 'A', ...other })]))[1];
    expect(html({ phase: 'past' })).toContain('class="label "');
    expect(html({ phase: 'open' })).toContain('label open');
    expect(html({ phase: 'future' })).toContain('label future');
    expect(html({ phase: 'current' })).toContain('aria-current="step"');
    expect(html({ skipped: true })).toContain('skipped');
  });

  it('italicizes the names of steps without text', () => {
    const [, named, unnamed] = rows(
      steps([step([1], { label: 'A' }), step([2])]),
    );
    expect(named).not.toContain('fallback');
    expect(unnamed).toContain('fallback');
    expect(unnamed).toContain('Step 2');
  });

  it('marks initial, overlay, and page steps', () => {
    const html = steps([
      step([1], {
        label: 'A',
        overlay: true,
        page: true,
        children: [step([1, 0], { label: 'B' })],
      }),
    ]);
    expect(html).toContain('Covers other content');
    expect(html).toContain('Exported as a page');
    expect(html).toContain('Shown up front');
  });
});

describe('welcomeHtml', () => {
  it('asks to preview the deck', () => {
    const html = welcomeHtml('its steps');
    expect(html).toContain('Preview this deck to see its steps.');
    expect(html).toContain('&quot;preview&quot;');
  });
});

describe('sidebarHtml', () => {
  it('allows only its own script', () => {
    const html = sidebarHtml('abc');
    expect(html).toContain(
      "default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-abc';",
    );
    expect(html).toContain('<script nonce="abc">');
  });
});
